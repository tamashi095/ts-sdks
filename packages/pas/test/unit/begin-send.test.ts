// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { describe, expect, it } from 'vitest';

import { PASClient } from '../../src/client.js';
import { derivePolicyAddress } from '../../src/derivation.js';
import type { PASPackageConfig } from '../../src/types.js';

const packageConfig: PASPackageConfig = {
	packageId: normalizeSuiAddress('0x123'),
	namespaceId: normalizeSuiAddress('0xabc'),
};

function makeClient() {
	return new PASClient({ packageConfig, suiClient: { network: 'testnet' } as never });
}

const ART = '0xabc::art_nft::Art';
const FROM = normalizeSuiAddress('0xa');
const TO = normalizeSuiAddress('0xb');
const OBJ = normalizeSuiAddress('0xc');

function pasIntents(tx: Transaction) {
	const { commands } = tx.getData();
	return commands
		.filter((c) => c.$kind === '$Intent' && c.$Intent.name === 'PAS')
		.map((c) => (c as Extract<typeof c, { $kind: '$Intent' }>).$Intent);
}

describe('deriveObjectPolicyAddress', () => {
	it('uses the unwrapped object type (matches identity-wrap derivePolicyAddress)', () => {
		const client = makeClient();
		expect(client.deriveObjectPolicyAddress(ART)).toBe(
			derivePolicyAddress(ART, packageConfig, { wrapType: (t) => t }),
		);
	});

	it('differs from the default Balance<T>-wrapped policy address', () => {
		const client = makeClient();
		expect(client.deriveObjectPolicyAddress(ART)).not.toBe(client.derivePolicyAddress(ART));
	});
});

describe('begin-send intents', () => {
	it('beginSendObject registers exactly one beginSendObject $Intent with its payload', () => {
		const client = makeClient();
		const tx = new Transaction();

		client.call.beginSendObject({ from: FROM, to: TO, objectType: ART, object: tx.object(OBJ) })(
			tx,
		);

		const intents = pasIntents(tx);
		expect(intents).toHaveLength(1);
		const data = intents[0].data as Record<string, unknown>;
		expect(data.action).toBe('beginSendObject');
		expect(data.from).toBe(FROM);
		expect(data.to).toBe(TO);
		expect(data.objectType).toBe(ART);
	});

	it('beginSendBalance registers a beginSendBalance $Intent with a stringified amount', () => {
		const client = makeClient();
		const tx = new Transaction();

		client.call.beginSendBalance({ from: FROM, to: TO, amount: 100n, assetType: '0x2::sui::SUI' })(
			tx,
		);

		const intents = pasIntents(tx);
		expect(intents).toHaveLength(1);
		const data = intents[0].data as Record<string, unknown>;
		expect(data.action).toBe('beginSendBalance');
		expect(data.amount).toBe('100');
		expect(data.assetType).toBe('0x2::sui::SUI');
	});

	it('the intent closure is memoized (calling it twice adds a single command)', () => {
		const client = makeClient();
		const tx = new Transaction();

		const begin = client.call.beginSendObject({
			from: FROM,
			to: TO,
			objectType: ART,
			object: tx.object(OBJ),
		});
		const a = begin(tx);
		const b = begin(tx);

		expect(a).toBe(b);
		expect(pasIntents(tx)).toHaveLength(1);
	});
});
