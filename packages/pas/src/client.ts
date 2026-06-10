// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ClientWithCoreApi } from '@mysten/sui/client';

import { TESTNET_PAS_PACKAGE_CONFIG, MAINNET_PAS_PACKAGE_CONFIG } from './constants.js';
import {
	deriveAccountAddress,
	derivePolicyAddress,
	deriveTemplateAddress,
	deriveTemplateRegistryAddress,
} from './derivation.js';
import { PASClientError } from './error.js';
import {
	accountForAddressIntent,
	beginSendBalanceIntent,
	beginSendObjectIntent,
	sendBalanceIntent,
	sendObjectIntent,
	unlockBalanceIntent,
	unlockObjectIntent,
	unlockUnrestrictedBalanceIntent,
	unlockUnrestrictedObjectIntent,
} from './intents.js';
import type { PASClientConfig, PASOptions, PASPackageConfig } from './types.js';

export function pas<const Name extends string = 'pas'>({
	packageConfig,
	name = 'pas' as Name,
	...options
}: PASOptions<Name> = {}): {
	name: Name;
	register: (client: ClientWithCoreApi) => PASClient;
} {
	return {
		name,
		register: (client: ClientWithCoreApi) =>
			new PASClient({ packageConfig, suiClient: client, ...options }),
	};
}

export class PASClient {
	#packageConfig: PASPackageConfig;

	constructor(config: PASClientConfig) {
		const network = config.suiClient.network;

		// Mainnet: no custom config allowed (avoid accidental republishing).
		if (network === 'mainnet' && config.packageConfig) {
			throw new PASClientError(
				'Custom package configuration is not allowed on mainnet. Use the built-in mainnet config when mainnet is supported.',
			);
		}

		if (config.packageConfig) {
			this.#packageConfig = config.packageConfig;
			return;
		}

		if (!network || (network !== 'mainnet' && network !== 'testnet')) {
			throw new PASClientError(
				'PAS client requires a known network (mainnet, testnet) or a custom package configuration.',
			);
		}

		this.#packageConfig =
			network === 'mainnet' ? MAINNET_PAS_PACKAGE_CONFIG : TESTNET_PAS_PACKAGE_CONFIG;
	}

	/**
	 * Get the package configuration
	 */
	getPackageConfig() {
		return this.#packageConfig;
	}

	/**
	 * Derives the account address for a given owner address.
	 *
	 * @param owner - The owner address (can be a user address or object address)
	 * @returns The derived account object ID
	 */
	deriveAccountAddress(owner: string): string {
		return deriveAccountAddress(owner, this.#packageConfig);
	}

	/**
	 * Derives the policy address for a given asset type T.
	 * By default wraps with `Balance<T>` to match the on-chain convention.
	 *
	 * @param assetType - The full type of the asset (e.g., "0x2::sui::SUI")
	 * @returns The derived policy object ID
	 */
	derivePolicyAddress(assetType: string): string {
		return derivePolicyAddress(assetType, this.#packageConfig);
	}

	/**
	 * Derives the policy address for a managed **object** type `T`. Unlike
	 * {@link derivePolicyAddress}, the type is used as-is (no `Balance<T>` wrap), matching
	 * the on-chain convention for object policies (`policy::new_for_object<T>`).
	 *
	 * @param objectType - The full object type (e.g. "0xabc::art_nft::Art")
	 * @returns The derived `Policy<T>` object ID
	 */
	deriveObjectPolicyAddress(objectType: string): string {
		return derivePolicyAddress(objectType, this.#packageConfig, { wrapType: (t) => t });
	}

	/**
	 * Derives the templates object address for a given package configuration.
	 *
	 * @returns The derived templates object ID
	 */
	deriveTemplateRegistryAddress(): string {
		return deriveTemplateRegistryAddress(this.#packageConfig);
	}

	/**
	 * Derives the template DF address for a given approval type name.
	 *
	 * @param approvalTypeName - The fully qualified approval type name
	 * @returns The derived dynamic field object ID
	 */
	deriveTemplateAddress(approvalTypeName: string): string {
		return deriveTemplateAddress(this.deriveTemplateRegistryAddress(), approvalTypeName);
	}

	/**
	 * Intent-based transaction builders. Each method returns a synchronous closure
	 * that registers a `$Intent` placeholder in the transaction. The actual PTB commands
	 * are resolved lazily at `tx.build()` time via the shared PAS resolver plugin.
	 */
	get call() {
		return {
			/**
			 * Creates a transfer funds intent. At build time, it auto-resolves the issuer's
			 * approval template commands by reading the Policy and Templates objects on-chain.
			 * If the recipient account does not exist, it will be created and shared automatically.
			 *
			 * @param options - Transfer options
			 * @param options.from - The sender's address (owner of the source account)
			 * @param options.to - The receiver's address (owner of the destination account)
			 * @param options.amount - The amount to transfer
			 * @param options.assetType - The full asset type (e.g., "0x2::sui::SUI")
			 * @returns A sync closure `(tx: Transaction) => TransactionResult`
			 */
			sendBalance: sendBalanceIntent(this.#packageConfig),

			/**
			 * Creates an unlock balance intent. At build time, it resolves the issuer's
			 * approval template commands. This will fail if the issuer has not configured
			 * unlock approvals for the asset type.
			 *
			 * @param options - Unlock options
			 * @param options.from - The sender's address (owner of the source account)
			 * @param options.amount - The amount to unlock
			 * @param options.assetType - The full asset type (e.g., "0x2::sui::SUI")
			 * @returns A sync closure `(tx: Transaction) => TransactionResult`
			 */
			unlockBalance: unlockBalanceIntent(this.#packageConfig),

			/**
			 * Creates an unlock balance intent for unrestricted (non-managed) assets.
			 * Use this when no Policy exists for the asset type (e.g., SUI).
			 *
			 * @param options - Unlock options
			 * @param options.from - The sender's address (owner of the source account)
			 * @param options.amount - The amount to unlock
			 * @param options.assetType - The full asset type (e.g., "0x2::sui::SUI")
			 * @returns A sync closure `(tx: Transaction) => TransactionResult`
			 */
			unlockUnrestrictedBalance: unlockUnrestrictedBalanceIntent(this.#packageConfig),

			/**
			 * Returns a account object for the given address. At build time, if the account
			 * already exists on-chain it resolves to an object reference; otherwise it
			 * creates the account and shares it.
			 *
			 * @param owner - The owner address
			 * @returns A sync closure `(tx: Transaction) => TransactionResult` (the account)
			 */
			accountForAddress: accountForAddressIntent(this.#packageConfig),

			/**
			 * Creates a send-object intent — the object analog of `sendBalance`. At build
			 * time it auto-resolves the issuer's `send_funds` approval template and the
			 * object's `Receiving<T>` reference. If the recipient account does not exist it
			 * is created and shared automatically.
			 *
			 * @param options.from - The sender's address (owner of the source account)
			 * @param options.to - The receiver's address (owner of the destination account)
			 * @param options.objectType - The full object type (e.g. "0xabc::permissioned_nft::Badge")
			 * @param options.object - The object to send, as a receiving argument: `tx.object(id)` or `tx.receivingRef(ref)`. Must live in the sender's account.
			 * @returns A sync closure `(tx: Transaction) => TransactionResult`
			 */
			sendObject: sendObjectIntent(this.#packageConfig),

			/**
			 * Creates an unlock-object intent for a managed object type — the object analog
			 * of `unlockBalance`. Resolves the issuer's `unlock_funds` approval template;
			 * fails if the issuer has not configured unlock approvals for the type.
			 *
			 * @param options.from - The owner of the source account
			 * @param options.objectType - The full object type
			 * @param options.object - The object to unlock, as a receiving argument: `tx.object(id)` or `tx.receivingRef(ref)`
			 * @returns A sync closure `(tx: Transaction) => TransactionResult` (the unlocked object)
			 */
			unlockObject: unlockObjectIntent(this.#packageConfig),

			/**
			 * Creates an unlock-object intent for an unmanaged (no-policy) object type — the
			 * object analog of `unlockUnrestrictedBalance`. Use this to retrieve an object of
			 * a type that has no `Policy<T>` (e.g. one airdropped into your account).
			 *
			 * @param options.from - The owner of the source account
			 * @param options.objectType - The full object type
			 * @param options.object - The object to unlock, as a receiving argument: `tx.object(id)` or `tx.receivingRef(ref)`
			 * @returns A sync closure `(tx: Transaction) => TransactionResult` (the unlocked object)
			 */
			unlockUnrestrictedObject: unlockUnrestrictedObjectIntent(this.#packageConfig),

			/**
			 * Begins an object transfer and returns the raw `Request` hot potato — the front
			 * half of `sendObject` (account resolution + `new_auth` + `account::send_object`)
			 * WITHOUT running the issuer's approval templates or `resolve_object`. Use this to
			 * drive a custom finalization (e.g. an app-layer settlement pipeline that threads
			 * the request through its own rules and calls `resolve_object` itself).
			 *
			 * The caller MUST consume/resolve the returned request, otherwise `tx.build()`
			 * fails on the unresolved hot potato.
			 *
			 * @param options.from - The sender's address (owner of the source account)
			 * @param options.to - The receiver's address (owner of the destination account)
			 * @param options.objectType - The full object type (e.g. "0xabc::art_nft::Art")
			 * @param options.object - The object to send, as a receiving argument: `tx.object(id)` or `tx.receivingRef(ref)`
			 * @returns A sync closure `(tx: Transaction) => TransactionResult` (the `Request`)
			 */
			beginSendObject: beginSendObjectIntent(this.#packageConfig),

			/**
			 * Begins a balance transfer and returns the raw `Request` hot potato — the balance
			 * analog of `beginSendObject`. Resolves accounts + `new_auth` + `account::send_balance`
			 * and leaves resolution to the caller. The returned request MUST be resolved.
			 *
			 * @param options.from - The sender's address (owner of the source account)
			 * @param options.to - The receiver's address (owner of the destination account)
			 * @param options.amount - The amount to transfer
			 * @param options.assetType - The full asset type (e.g. "0x2::sui::SUI")
			 * @returns A sync closure `(tx: Transaction) => TransactionResult` (the `Request`)
			 */
			beginSendBalance: beginSendBalanceIntent(this.#packageConfig),
		};
	}
}
