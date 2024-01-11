import {
  assert,
  NearAmount,
  PromiseIndex,
  Register,
  str,
  encode,
  decode,
} from "./utils";
import { GasWeight, PromiseResult } from "./types";

const U64_MAX = 2n ** 64n - 1n;
const EVICTED_REGISTER = U64_MAX - 1n;

// Interface available in QuickJS
interface Env {
  // Panic
  panic_utf8(message: Uint8Array): never;

  // Logging
  log(message: string): void;
  log_utf8(message: Uint8Array): void;
  log_utf16(message: Uint8Array): void;

  // Read from register
  read_register(register: Register): Uint8Array;

  // Storage
  storage_read(key: Uint8Array, register: Register): bigint;
  storage_has_key(key: Uint8Array): bigint;
  storage_write(key: Uint8Array, value: Uint8Array, register: Register): bigint;
  storage_remove(key: Uint8Array, register: Register): bigint;
  storage_usage(): bigint;

  // Caller methods
  signer_account_id(register: Register): void;
  signer_account_pk(register: Register): void;
  attached_deposit(): bigint;
  predecessor_account_id(register: Register): void;
  input(register: Register): void;

  // Account data
  account_balance(): bigint;
  account_locked_balance(): bigint;
  current_account_id(register: Register): void;
  validator_stake(accountId: string): bigint;
  validator_total_stake(): bigint;

  // Blockchain info
  block_index(): bigint;
  block_timestamp(): bigint;
  epoch_height(): bigint;

  // Gas
  prepaid_gas(): bigint;
  used_gas(): bigint;

  // Helper methods and cryptography
  value_return(value: Uint8Array): void;
  random_seed(register: Register): void;
  sha256(value: Uint8Array, register: Register): void;
  keccak256(value: Uint8Array, register: Register): void;
  keccak512(value: Uint8Array, register: Register): void;
  ripemd160(value: Uint8Array, register: Register): void;
  ecrecover(
    hash: Uint8Array,
    sig: Uint8Array,
    v: number,
    malleabilityFlag: number,
    register: Register
  ): bigint;
  alt_bn128_g1_multiexp(value: Uint8Array, register: Register): void;
  alt_bn128_g1_sum(value: Uint8Array, register: Register): void;
  alt_bn128_pairing_check(value: Uint8Array): bigint;

  // Promises
  promise_create(
    accountId: string,
    methodName: string,
    args: Uint8Array,
    amount: NearAmount,
    gas: NearAmount
  ): bigint;
  promise_then(
    promiseIndex: bigint,
    accountId: string,
    methodName: string,
    args: Uint8Array,
    amount: NearAmount,
    gas: NearAmount
  ): bigint;
  promise_and(...promiseIndexes: bigint[]): bigint;
  promise_batch_create(accountId: string): bigint;
  promise_batch_then(promiseIndex: bigint, accountId: string): bigint;
  promise_batch_action_create_account(promiseIndex: bigint): void;
  promise_batch_action_deploy_contract(
    promiseIndex: bigint,
    code: Uint8Array
  ): void;
  promise_batch_action_function_call(
    promiseIndex: bigint,
    methodName: string,
    args: Uint8Array,
    amount: NearAmount,
    gas: NearAmount
  ): void;
  promise_batch_action_transfer(promiseIndex: bigint, amount: NearAmount): void;
  promise_batch_action_stake(
    promiseIndex: bigint,
    amount: NearAmount,
    publicKey: Uint8Array
  ): void;
  promise_batch_action_add_key_with_full_access(
    promiseIndex: bigint,
    publicKey: Uint8Array,
    nonce: number | bigint
  ): void;
  promise_batch_action_add_key_with_function_call(
    promiseIndex: bigint,
    publicKey: Uint8Array,
    nonce: number | bigint,
    allowance: NearAmount,
    receiverId: string,
    methodNames: string
  ): void;
  promise_batch_action_delete_key(
    promiseIndex: bigint,
    publicKey: Uint8Array
  ): void;
  promise_batch_action_delete_account(
    promiseIndex: bigint,
    beneficiaryId: string
  ): void;
  promise_batch_action_function_call_weight(
    promiseIndex: bigint,
    methodName: string,
    args: Uint8Array,
    amount: NearAmount,
    gas: NearAmount,
    weight: GasWeight
  ): void;
  promise_results_count(): bigint;
  promise_result(promiseIndex: bigint, register: Register): PromiseResult;
  promise_return(promiseIndex: bigint): void;

  // These are exported C functions that not part of NEAR VM Logic (host functions)
  uint8array_to_latin1_string(a: Uint8Array): string;
  uint8array_to_utf8_string(a: Uint8Array): string;
  latin1_string_to_uint8array(s: string): Uint8Array;
  utf8_string_to_uint8array(s: string): Uint8Array;
}

declare const env: Env;

/**
 * Logs parameters in the NEAR WASM virtual machine.
 *
 * @param params - Parameters to log.
 */
export function log(...params: unknown[]): void {
  env.log(
    params.reduce<string>((accumulated, parameter, index) => {
      // Stringify undefined
      const param = parameter === undefined ? "undefined" : parameter;
      // Convert Objects to strings and convert to string
      const stringified =
        typeof param === "object" ? JSON.stringify(param) : `${param}`;

      if (index === 0) {
        return stringified;
      }

      return `${accumulated} ${stringified}`;
    }, "")
  );
}

/**
 * Returns the account ID of the account that signed the transaction.
 * Can only be called in a call or initialize function.
 */
export function signerAccountId(): string {
  env.signer_account_id(0);
  return str(env.read_register(0));
}

/**
 * Returns the public key of the account that signed the transaction.
 * Can only be called in a call or initialize function.
 */
export function signerAccountPk(): Uint8Array {
  env.signer_account_pk(0);
  return env.read_register(0);
}

/**
 * Returns the account ID of the account that called the function.
 * Can only be called in a call or initialize function.
 */
export function predecessorAccountId(): string {
  env.predecessor_account_id(0);
  return str(env.read_register(0));
}

/**
 * Returns the account ID of the current contract - the contract that is being executed.
 */
export function currentAccountId(): string {
  env.current_account_id(0);
  return str(env.read_register(0));
}

/**
 * Returns the current block index.
 */
export function blockIndex(): bigint {
  return env.block_index();
}

/**
 * Returns the current block height.
 */
export function blockHeight(): bigint {
  return blockIndex();
}

/**
 * Returns the current block timestamp.
 */
export function blockTimestamp(): bigint {
  return env.block_timestamp();
}

/**
 * Returns the current epoch height.
 */
export function epochHeight(): bigint {
  return env.epoch_height();
}

/**
 * Returns the amount of NEAR attached to this function call.
 * Can only be called in payable functions.
 */
export function attachedDeposit(): bigint {
  return env.attached_deposit();
}

/**
 * Returns the amount of Gas that was attached to this function call.
 */
export function prepaidGas(): bigint {
  return env.prepaid_gas();
}

/**
 * Returns the amount of Gas that has been used by this function call until now.
 */
export function usedGas(): bigint {
  return env.used_gas();
}

/**
 * Returns the current account's account balance.
 */
export function accountBalance(): bigint {
  return env.account_balance();
}

/**
 * Returns the current account's locked balance.
 */
export function accountLockedBalance(): bigint {
  return env.account_locked_balance();
}

/**
 * Reads the value from NEAR storage that is stored under the provided key.
 *
 * @param key - The key to read from storage.
 */
export function storageReadRaw(key: Uint8Array): Uint8Array | null {
  const returnValue = env.storage_read(key, 0);

  if (returnValue !== 1n) {
    return null;
  }

  return env.read_register(0);
}

/**
 * Reads the utf-8 string value from NEAR storage that is stored under the provided key.
 *
 * @param key - The utf-8 string key to read from storage.
 */
export function storageRead(key: string): string | null {
  const ret = storageReadRaw(encode(key));
  if (ret !== null) {
    return decode(ret);
  }
  return null;
}

/**
 * Checks for the existance of a value under the provided key in NEAR storage.
 *
 * @param key - The key to check for in storage.
 */
export function storageHasKeyRaw(key: Uint8Array): boolean {
  return env.storage_has_key(key) === 1n;
}

/**
 * Checks for the existance of a value under the provided utf-8 string key in NEAR storage.
 *
 * @param key - The utf-8 string key to check for in storage.
 */
export function storageHasKey(key: string): boolean {
  return storageHasKeyRaw(encode(key));
}

/**
 * Get the last written or removed value from NEAR storage.
 */
export function storageGetEvictedRaw(): Uint8Array {
  return env.read_register(EVICTED_REGISTER);
}

/**
 * Get the last written or removed value from NEAR storage as utf-8 string.
 */
export function storageGetEvicted(): string {
  return decode(storageGetEvictedRaw());
}

/**
 * Returns the current accounts NEAR storage usage.
 */
export function storageUsage(): bigint {
  return env.storage_usage();
}

/**
 * Writes the provided bytes to NEAR storage under the provided key.
 *
 * @param key - The key under which to store the value.
 * @param value - The value to store.
 */
export function storageWriteRaw(key: Uint8Array, value: Uint8Array): boolean {
  return env.storage_write(key, value, EVICTED_REGISTER) === 1n;
}

/**
 * Writes the provided utf-8 string to NEAR storage under the provided key.
 *
 * @param key - The utf-8 string key under which to store the value.
 * @param value - The utf-8 string value to store.
 */
export function storageWrite(key: string, value: string): boolean {
  return storageWriteRaw(encode(key), encode(value));
}

/**
 * Removes the value of the provided key from NEAR storage.
 *
 * @param key - The key to be removed.
 */
export function storageRemoveRaw(key: Uint8Array): boolean {
  return env.storage_remove(key, EVICTED_REGISTER) === 1n;
}

/**
 * Removes the value of the provided utf-8 string key from NEAR storage.
 *
 * @param key - The utf-8 string key to be removed.
 */
export function storageRemove(key: string): boolean {
  return storageRemoveRaw(encode(key));
}

/**
 * Returns the cost of storing 0 Byte on NEAR storage.
 */
export function storageByteCost(): bigint {
  return 10_000_000_000_000_000_000n;
}

/**
 * Returns the arguments passed to the current smart contract call.
 */
export function inputRaw(): Uint8Array {
  env.input(0);
  return env.read_register(0);
}

/**
 * Returns the arguments passed to the current smart contract call as utf-8 string.
 */
export function input(): string {
  return decode(inputRaw());
}

/**
 * Returns the value from the NEAR WASM virtual machine.
 *
 * @param value - The value to return.
 */
export function valueReturnRaw(value: Uint8Array): void {
  env.value_return(value);
}

/**
 * Returns the utf-8 string value from the NEAR WASM virtual machine.
 *
 * @param value - The utf-8 string value to return.
 */
export function valueReturn(value: string): void {
  valueReturnRaw(encode(value));
}

/**
 * Returns a random string of bytes.
 */
export function randomSeed(): Uint8Array {
  env.random_seed(0);
  return env.read_register(0);
}

/**
 * Create a NEAR promise call to a contract on the blockchain.
 *
 * @param accountId - The account ID of the target contract.
 * @param methodName - The name of the method to be called.
 * @param args - The arguments to call the method with.
 * @param amount - The amount of NEAR attached to the call.
 * @param gas - The amount of Gas attached to the call.
 */
export function promiseCreateRaw(
  accountId: string,
  methodName: string,
  args: Uint8Array,
  amount: NearAmount,
  gas: NearAmount
): PromiseIndex {
  return env.promise_create(
    accountId,
    methodName,
    args,
    amount,
    gas
  ) as unknown as PromiseIndex;
}

/**
 * Create a NEAR promise call to a contract on the blockchain.
 *
 * @param accountId - The account ID of the target contract.
 * @param methodName - The name of the method to be called.
 * @param args - The utf-8 string arguments to call the method with.
 * @param amount - The amount of NEAR attached to the call.
 * @param gas - The amount of Gas attached to the call.
 */
export function promiseCreate(
  accountId: string,
  methodName: string,
  args: string,
  amount: NearAmount,
  gas: NearAmount
): PromiseIndex {
  return promiseCreateRaw(accountId, methodName, encode(args), amount, gas);
}

/**
 * Attach a callback NEAR promise to be executed after a provided promise.
 *
 * @param promiseIndex - The promise after which to call the callback.
 * @param accountId - The account ID of the contract to perform the callback on.
 * @param methodName - The name of the method to call.
 * @param args - The arguments to call the method with.
 * @param amount - The amount of NEAR to attach to the call.
 * @param gas - The amount of Gas to attach to the call.
 */
export function promiseThenRaw(
  promiseIndex: PromiseIndex,
  accountId: string,
  methodName: string,
  args: Uint8Array,
  amount: NearAmount,
  gas: NearAmount
): PromiseIndex {
  return env.promise_then(
    promiseIndex as unknown as bigint,
    accountId,
    methodName,
    args,
    amount,
    gas
  ) as unknown as PromiseIndex;
}

/**
 * Attach a callback NEAR promise to be executed after a provided promise.
 *
 * @param promiseIndex - The promise after which to call the callback.
 * @param accountId - The account ID of the contract to perform the callback on.
 * @param methodName - The name of the method to call.
 * @param args - The utf-8 string arguments to call the method with.
 * @param amount - The amount of NEAR to attach to the call.
 * @param gas - The amount of Gas to attach to the call.
 */
export function promiseThen(
  promiseIndex: PromiseIndex,
  accountId: string,
  methodName: string,
  args: string,
  amount: NearAmount,
  gas: NearAmount
): PromiseIndex {
  return promiseThenRaw(
    promiseIndex,
    accountId,
    methodName,
    encode(args),
    amount,
    gas
  );
}

/**
 * Join an arbitrary array of NEAR promises.
 *
 * @param promiseIndexes - An arbitrary array of NEAR promise indexes to join.
 */
export function promiseAnd(...promiseIndexes: PromiseIndex[]): PromiseIndex {
  return env.promise_and(
    ...(promiseIndexes as unknown as bigint[])
  ) as unknown as PromiseIndex;
}

/**
 * Create a NEAR promise which will have multiple promise actions inside.
 *
 * @param accountId - The account ID of the target contract.
 */
export function promiseBatchCreate(accountId: string): PromiseIndex {
  return env.promise_batch_create(accountId) as unknown as PromiseIndex;
}

/**
 * Attach a callback NEAR promise to a batch of NEAR promise actions.
 *
 * @param promiseIndex - The NEAR promise index of the batch.
 * @param accountId - The account ID of the target contract.
 */
export function promiseBatchThen(
  promiseIndex: PromiseIndex,
  accountId: string
): PromiseIndex {
  return env.promise_batch_then(
    promiseIndex as unknown as bigint,
    accountId
  ) as unknown as PromiseIndex;
}

/**
 * Attach a create account promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a create account action to.
 */
export function promiseBatchActionCreateAccount(
  promiseIndex: PromiseIndex
): void {
  env.promise_batch_action_create_account(promiseIndex as unknown as bigint);
}

/**
 * Attach a deploy contract promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a deploy contract action to.
 * @param code - The WASM byte code of the contract to be deployed.
 */
export function promiseBatchActionDeployContract(
  promiseIndex: PromiseIndex,
  code: Uint8Array
): void {
  env.promise_batch_action_deploy_contract(
    promiseIndex as unknown as bigint,
    code
  );
}

/**
 * Attach a function call promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a function call action to.
 * @param methodName - The name of the method to be called.
 * @param args - The arguments to call the method with.
 * @param amount - The amount of NEAR to attach to the call.
 * @param gas - The amount of Gas to attach to the call.
 */
export function promiseBatchActionFunctionCallRaw(
  promiseIndex: PromiseIndex,
  methodName: string,
  args: Uint8Array,
  amount: NearAmount,
  gas: NearAmount
): void {
  env.promise_batch_action_function_call(
    promiseIndex as unknown as bigint,
    methodName,
    args,
    amount,
    gas
  );
}

/**
 * Attach a function call promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a function call action to.
 * @param methodName - The name of the method to be called.
 * @param args - The utf-8 string arguments to call the method with.
 * @param amount - The amount of NEAR to attach to the call.
 * @param gas - The amount of Gas to attach to the call.
 */
export function promiseBatchActionFunctionCall(
  promiseIndex: PromiseIndex,
  methodName: string,
  args: string,
  amount: NearAmount,
  gas: NearAmount
): void {
  promiseBatchActionFunctionCallRaw(
    promiseIndex,
    methodName,
    encode(args),
    amount,
    gas
  );
}

/**
 * Attach a transfer promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a transfer action to.
 * @param amount - The amount of NEAR to transfer.
 */
export function promiseBatchActionTransfer(
  promiseIndex: PromiseIndex,
  amount: NearAmount
): void {
  env.promise_batch_action_transfer(promiseIndex as unknown as bigint, amount);
}

/**
 * Attach a stake promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a stake action to.
 * @param amount - The amount of NEAR to stake.
 * @param publicKey - The public key with which to stake.
 */
export function promiseBatchActionStake(
  promiseIndex: PromiseIndex,
  amount: NearAmount,
  publicKey: Uint8Array
): void {
  env.promise_batch_action_stake(
    promiseIndex as unknown as bigint,
    amount,
    publicKey
  );
}

/**
 * Attach a add full access key promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a add full access key action to.
 * @param publicKey - The public key to add as a full access key.
 * @param nonce - The nonce to use.
 */
export function promiseBatchActionAddKeyWithFullAccess(
  promiseIndex: PromiseIndex,
  publicKey: Uint8Array,
  nonce: number | bigint
): void {
  env.promise_batch_action_add_key_with_full_access(
    promiseIndex as unknown as bigint,
    publicKey,
    nonce
  );
}

/**
 * Attach a add access key promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a add access key action to.
 * @param publicKey - The public key to add.
 * @param nonce - The nonce to use.
 * @param allowance - The allowance of the access key.
 * @param receiverId - The account ID of the receiver.
 * @param methodNames - The names of the method to allow the key for.
 */
export function promiseBatchActionAddKeyWithFunctionCall(
  promiseIndex: PromiseIndex,
  publicKey: Uint8Array,
  nonce: number | bigint,
  allowance: NearAmount,
  receiverId: string,
  methodNames: string
): void {
  env.promise_batch_action_add_key_with_function_call(
    promiseIndex as unknown as bigint,
    publicKey,
    nonce,
    allowance,
    receiverId,
    methodNames
  );
}

/**
 * Attach a delete key promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a delete key action to.
 * @param publicKey - The public key to delete.
 */
export function promiseBatchActionDeleteKey(
  promiseIndex: PromiseIndex,
  publicKey: Uint8Array
): void {
  env.promise_batch_action_delete_key(
    promiseIndex as unknown as bigint,
    publicKey
  );
}

/**
 * Attach a delete account promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a delete account action to.
 * @param beneficiaryId - The account ID of the beneficiary - the account that receives the remaining amount of NEAR.
 */
export function promiseBatchActionDeleteAccount(
  promiseIndex: PromiseIndex,
  beneficiaryId: string
): void {
  env.promise_batch_action_delete_account(
    promiseIndex as unknown as bigint,
    beneficiaryId
  );
}

/**
 * Attach a function call with weight promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a function call with weight action to.
 * @param methodName - The name of the method to be called.
 * @param args - The arguments to call the method with.
 * @param amount - The amount of NEAR to attach to the call.
 * @param gas - The amount of Gas to attach to the call.
 * @param weight - The weight of unused Gas to use.
 */
export function promiseBatchActionFunctionCallWeightRaw(
  promiseIndex: PromiseIndex,
  methodName: string,
  args: Uint8Array,
  amount: NearAmount,
  gas: NearAmount,
  weight: GasWeight
): void {
  env.promise_batch_action_function_call_weight(
    promiseIndex as unknown as bigint,
    methodName,
    args,
    amount,
    gas,
    weight
  );
}

/**
 * Attach a function call with weight promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a function call with weight action to.
 * @param methodName - The name of the method to be called.
 * @param args - The utf-8 string arguments to call the method with.
 * @param amount - The amount of NEAR to attach to the call.
 * @param gas - The amount of Gas to attach to the call.
 * @param weight - The weight of unused Gas to use.
 */
export function promiseBatchActionFunctionCallWeight(
  promiseIndex: PromiseIndex,
  methodName: string,
  args: string,
  amount: NearAmount,
  gas: NearAmount,
  weight: GasWeight
): void {
  promiseBatchActionFunctionCallWeightRaw(
    promiseIndex,
    methodName,
    encode(args),
    amount,
    gas,
    weight
  );
}

/**
 * The number of promise results available.
 */
export function promiseResultsCount(): bigint {
  return env.promise_results_count();
}

/**
 * Returns the result of the NEAR promise for the passed promise index.
 *
 * @param promiseIndex - The index of the promise to return the result for.
 */
export function promiseResultRaw(promiseIndex: PromiseIndex): Uint8Array {
  const status = env.promise_result(promiseIndex as unknown as bigint, 0);

  assert(
    Number(status) === PromiseResult.Successful,
    `Promise result ${
      status == PromiseResult.Failed
        ? "Failed"
        : status == PromiseResult.NotReady
        ? "NotReady"
        : status
    }`
  );

  return env.read_register(0);
}

/**
 * Returns the result of the NEAR promise for the passed promise index as utf-8 string
 *
 * @param promiseIndex - The index of the promise to return the result for.
 */
export function promiseResult(promiseIndex: PromiseIndex): string {
  return decode(promiseResultRaw(promiseIndex));
}

/**
 * Executes the promise in the NEAR WASM virtual machine.
 *
 * @param promiseIndex - The index of the promise to execute.
 */
export function promiseReturn(promiseIndex: PromiseIndex): void {
  env.promise_return(promiseIndex as unknown as bigint);
}

/**
 * Returns sha256 hash of given value
 * @param value - value to be hashed, in Bytes
 * @returns hash result in Bytes
 */
export function sha256(value: Uint8Array): Uint8Array {
  env.sha256(value, 0);
  return env.read_register(0);
}

/**
 * Returns keccak256 hash of given value
 * @param value - value to be hashed, in Bytes
 * @returns hash result in Bytes
 */
export function keccak256(value: Uint8Array): Uint8Array {
  env.keccak256(value, 0);
  return env.read_register(0);
}

/**
 * Returns keccak512 hash of given value
 * @param value - value to be hashed, in Bytes
 * @returns hash result in Bytes
 */
export function keccak512(value: Uint8Array): Uint8Array {
  env.keccak512(value, 0);
  return env.read_register(0);
}

/**
 * Returns ripemd160 hash of given value
 * @param value - value to be hashed, in Bytes
 * @returns hash result in Bytes
 */
export function ripemd160(value: Uint8Array): Uint8Array {
  env.ripemd160(value, 0);
  return env.read_register(0);
}

/**
 * Recovers an ECDSA signer address from a 32-byte message hash and a corresponding
 * signature along with v recovery byte. Takes in an additional flag to check for
 * malleability of the signature which is generally only ideal for transactions.
 *
 * @param hash - 32-byte message hash
 * @param sig - signature
 * @param v - number of recovery byte
 * @param malleabilityFlag - whether to check malleability
 * @returns 64 bytes representing the public key if the recovery was successful.
 */
export function ecrecover(
  hash: Uint8Array,
  sig: Uint8Array,
  v: number,
  malleabilityFlag: number
): Uint8Array | null {
  const returnValue = env.ecrecover(hash, sig, v, malleabilityFlag, 0);

  if (returnValue === 0n) {
    return null;
  }

  return env.read_register(0);
}

// NOTE: "env.panic(msg)" is not exported, use "throw Error(msg)" instead

/**
 * Panic the transaction execution with given message
 * @param msg - panic message in raw bytes, which should be a valid UTF-8 sequence
 */
export function panicUtf8(msg: Uint8Array): never {
  env.panic_utf8(msg);
}

/**
 * Log the message in transaction logs
 * @param msg - message in raw bytes, which should be a valid UTF-8 sequence
 */
export function logUtf8(msg: Uint8Array) {
  env.log_utf8(msg);
}

/**
 * Log the message in transaction logs
 * @param msg - message in raw bytes, which should be a valid UTF-16 sequence
 */
export function logUtf16(msg: Uint8Array) {
  env.log_utf16(msg);
}

/**
 * Returns the number of staked NEAR of given validator, in yoctoNEAR
 * @param accountId - validator's AccountID
 * @returns - staked amount
 */
export function validatorStake(accountId: string): bigint {
  return env.validator_stake(accountId);
}

/**
 * Returns the number of staked NEAR of all validators, in yoctoNEAR
 * @returns total staked amount
 */
export function validatorTotalStake(): bigint {
  return env.validator_total_stake();
}

/**
 * Computes multiexp on alt_bn128 curve using Pippenger's algorithm \sum_i
 * mul_i g_{1 i} should be equal result.
 *
 * @param value - equence of (g1:G1, fr:Fr), where
 * G1 is point (x:Fq, y:Fq) on alt_bn128,
 * alt_bn128 is Y^2 = X^3 + 3 curve over Fq.
 * `value` is encoded as packed, little-endian
 * `[((u256, u256), u256)]` slice.
 *
 * @returns multi exp sum
 */
export function altBn128G1Multiexp(value: Uint8Array): Uint8Array {
  env.alt_bn128_g1_multiexp(value, 0);
  return env.read_register(0);
}

/**
 * Computes sum for signed g1 group elements on alt_bn128 curve \sum_i
 * (-1)^{sign_i} g_{1 i} should be equal result.
 *
 * @param value - sequence of (sign:bool, g1:G1), where
 * G1 is point (x:Fq, y:Fq) on alt_bn128,
 * alt_bn128 is Y^2 = X^3 + 3 curve over Fq.
 * value` is encoded a as packed, little-endian
 * `[((u256, u256), ((u256, u256), (u256, u256)))]` slice.
 *
 * @returns sum over Fq.
 */
export function altBn128G1Sum(value: Uint8Array): Uint8Array {
  env.alt_bn128_g1_sum(value, 0);
  return env.read_register(0);
}

/**
 * Computes pairing check on alt_bn128 curve.
 * \sum_i e(g_{1 i}, g_{2 i}) should be equal one (in additive notation), e(g1, g2) is Ate pairing
 *
 * @param value - sequence of (g1:G1, g2:G2), where
 * G2 is Fr-ordered subgroup point (x:Fq2, y:Fq2) on alt_bn128 twist,
 * alt_bn128 twist is Y^2 = X^3 + 3/(i+9) curve over Fq2
 * Fq2 is complex field element (re: Fq, im: Fq)
 * G1 is point (x:Fq, y:Fq) on alt_bn128,
 * alt_bn128 is Y^2 = X^3 + 3 curve over Fq
 * `value` is encoded a as packed, little-endian
 * `[((u256, u256), ((u256, u256), (u256, u256)))]` slice.
 *
 * @returns whether pairing check pass
 */
export function altBn128PairingCheck(value: Uint8Array): boolean {
  return env.alt_bn128_pairing_check(value) === 1n;
}
