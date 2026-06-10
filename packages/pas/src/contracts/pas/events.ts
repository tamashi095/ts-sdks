/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
const $moduleName = '@mysten/pas::events';
export const FundsSent = new MoveStruct({
	name: `${$moduleName}::FundsSent<phantom T>`,
	fields: {
		sender: bcs.Address,
		recipient: bcs.Address,
		amount: bcs.u64(),
	},
});
export const FundsClawback = new MoveStruct({
	name: `${$moduleName}::FundsClawback<phantom T>`,
	fields: {
		owner: bcs.Address,
		amount: bcs.u64(),
	},
});
export const FundsUnlocked = new MoveStruct({
	name: `${$moduleName}::FundsUnlocked<phantom T>`,
	fields: {
		owner: bcs.Address,
		amount: bcs.u64(),
	},
});
export const ObjectSent = new MoveStruct({
	name: `${$moduleName}::ObjectSent<phantom T>`,
	fields: {
		sender: bcs.Address,
		recipient: bcs.Address,
		object_id: bcs.Address,
	},
});
export const ObjectClawback = new MoveStruct({
	name: `${$moduleName}::ObjectClawback<phantom T>`,
	fields: {
		owner: bcs.Address,
		object_id: bcs.Address,
	},
});
export const ObjectUnlocked = new MoveStruct({
	name: `${$moduleName}::ObjectUnlocked<phantom T>`,
	fields: {
		owner: bcs.Address,
		object_id: bcs.Address,
	},
});
