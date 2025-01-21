export const DB_VERSION = 1;

/**
 * Commits the given transaction if it's not in read-only mode.
 *
 * @param {IDBTransaction|IDBRequest|null} transaction The transaction to commit.
 * @returns {boolean} True if the transaction was committed, false otherwise.
 */
export function commitTransaction(transaction) {
	if (transaction instanceof IDBRequest) {
		return commitTransaction(transaction.transaction);
	} else if (transaction instanceof IDBTransaction && transaction.mode !== 'readonly') {
		transaction.commit();
		return true;
	} else {
		return false;
	}
}

/**
 * Aborts the given transaction if it's not in read-only mode.
 *
 * @param {IDBTransaction|IDBRequest|null} transaction The transaction to abort.
 * @returns {boolean} True if the transaction was aborted, false otherwise.
 */
export function abortTransaction(transaction) {
	if (transaction instanceof IDBRequest) {
		return abortTransaction(transaction.transaction);
	} else if (transaction instanceof IDBTransaction && transaction.mode !== 'readonly') {
		transaction.abort();
		return true;
	} else {
		return false;
	}
}

/**
 * Handles an IndexedDB request.
 *
 * @param {IDBRequest} request The IndexedDB request to handle.
 * @param {Object} [options] Options for handling the request.
 * @param {AbortSignal} [options.signal] An AbortSignal object to monitor for abort events.
 * @returns {Promise<any>} A promise that resolves with the result of the request  or rejects with an error.
 * @throws {Error} Any error from an aborted signal.
 * @throws {DOMException} If in error occurs in handling the request.
 */
export function handleIDBRequest(request, { signal: passedSignal } = {}) {
	const { resolve, reject, promise } = Promise.withResolvers();

	if (passedSignal instanceof AbortSignal && passedSignal.aborted) {
		reject(passedSignal.reason);
	} else if (! (request instanceof IDBRequest)) {
		reject(new TypeError('Request must be an `IDBRequest`.'));
	} else {
		const controller = new AbortController();

		try {
			const signal = passedSignal instanceof AbortSignal
				? AbortSignal.any([passedSignal, controller.signal])
				: controller.signal;

			request.addEventListener('success', ({ target }) => {
				resolve(target.result);
				commitTransaction(target.transaction);
				controller.abort();
			}, { signal, once: true });

			request.addEventListener('error', ({ target }) => {
				abortTransaction(target.transaction);
				controller.abort(target.error);
				reject(target.error);
			}, { signal, once: true });
		} catch(err) {
			reject(err);
			controller.abort(err);
			abortTransaction(request.transaction);
		}
	}

	return promise;
}

/**
 * Opens an IndexedDB database.
 *
 * @param {string} name The name of the database to open.
 * @param {Object} [config] Configuration options for opening the database.
 * @param {number} [config.version=1] The version of the database to open.
 * @param {Function} [config.onUpgrade] A function to be called if the database version is upgraded.
 * @param {AbortSignal} [config.signal] An AbortSignal object to monitor for abort events.
 * @returns {Promise<IDBDatabase>} A promise that resolves to the opened IDBDatabase object.
 * @throws {Error} Any error of an aborted signal.
 * @throws {DOMException} If in error occurs in handling the request.
 */
export async function openDB(name, {
	version = DB_VERSION,
	onUpgrade,
	signal,
} = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else {
		const request = indexedDB.open(name, version);

		if (onUpgrade instanceof Function) {
			request.addEventListener('upgradeneeded', onUpgrade, { signal, once: true });
		}

		return await handleIDBRequest(request, { signal });

	}
}

/**
 * Gets an object store from the given database.
 *
 * @param {IDBDatabase} db The database to get the object store from.
 * @param {string} storeName The name of the object store to get.
 * @param {Object} [options] Options for the transaction.
 * @param {IDBTransactionMode} [options.mode="readonly"] The transaction mode.
 * @param {IDBTransactionDurability} [options.durability="default"] Controls how quickly changes are written to disk.
 * @returns {IDBObjectStore} The object store.
 * @throws {TypeError|DOMException} For various errors that could occur accessing the object store.
 */
export function getStore(db, storeName, { mode = 'readonly', durability = 'default' } = {}) {
	return db.transaction(storeName, mode, { durability }).objectStore(storeName);
}

/**
 * Gets an object store from the given database in read-only mode.
 *
 * @param {IDBDatabase} db The database to get the object store from.
 * @param {string} storeName The name of the object store to get.
 * @param {Object} [options] Options for the transaction.
 * @returns {IDBObjectStore} The object store.
 * @throws {TypeError|DOMException} For various errors that could occur accessing the object store.
 */
export const getStoreReadOnly = (db, storeName) => getStore(db, storeName, { mode: 'readonly' });

/**
 * Gets an object store from the given database in read-write mode.
 *
 * @param {IDBDatabase} db The database to get the object store from.
 * @param {string} storeName The name of the object store to get.
 * @param {Object} [options] Options for the transaction.
 * @param {IDBTransactionDurability} [options.durability="default"] Controls how quickly changes are written to disk.
 * @returns {IDBObjectStore} The object store.
 * @throws {TypeError|DOMException} For various errors that could occur accessing the object store.
 */
export const getStoreReadWrite = (db, storeName, { durability = 'default' }) => getStore(db, storeName, { mode: 'readwrite', durability });

/**
 * Gets an item from the given object store.
 *
 * @param {IDBDatabase} db The database to get the object store from.
 * @param {string} storeName The name of the object store to get the item from.
 * @param {IDBValidKey|IDBKeyRange} key The key of the item to get.
 * @param {Object} [options] Options for the operation.
 * @param {AbortSignal} [options.signal] An AbortSignal object to monitor for abort events.
 * @returns {Promise<any>} A promise that resolves to the item.
 * @throws {Error} Any error of an aborted signal.
 * @throws {TypeError|DOMException} For various errors that could occur accessing the object store.
 */
export async function getItem(db, storeName, key, { signal } = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else {
		const store = getStoreReadOnly(db, storeName);
		return await handleIDBRequest(store.get(key), { signal });
	}
}

/**
 * Gets all items from the given object store.
 *
 * @param {IDBDatabase} db The database to get the object store from.
 * @param {string} storeName The name of the object store to get items from.
 * @param {IDBValidKey|IDBKeyRange|null} query The query to use to filter items.
 * @param {Object} [options] Options for the operation.
 * @param {number|null} [options.count] The maximum number of items to return.
 * @param {AbortSignal} [options.signal] An AbortSignal object to monitor for abort events.
 * @returns {Promise<any[]>} A promise that resolves to an array of items.
 * @throws {Error} If the AbortSignal is aborted.
 * @throws {TypeError|DOMException} For various errors that could occur accessing the object store.
 */
export async function getAllItems(db, storeName, query, { count, signal } = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else {
		const store = getStoreReadOnly(db, storeName);
		return await handleIDBRequest(store.getAll(query, count));
	}
}

/**
 * Puts an item to the specified object store.
 *
 * @param {IDBDatabase} db The database.
 * @param {string} storeName The store name.
 * @param {any} value The item value.
 * @param {Object} [options] Options.
 * @param {IDBValidKey} [options.key] Optional key for the item.
 * @param {IDBTransactionDurability} [options.durability="default"] Controls how quickly changes are written to disk.
 * @param {AbortSignal} [options.signal] Abort signal.
 * @returns {Promise<IDBValidKey>} The added item's key.
 * @throws {Error} If the operation is aborted.
 * @throws {TypeError|DOMException} For various errors that could occur accessing the object store.
 */
export async function putItem(db, storeName, value, { durability = 'default', key, signal } = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else {
		const store = getStoreReadWrite(db, storeName, { durability });
		return await handleIDBRequest(store.put(value, key));
	}
}

/**
 * Adds an item to the specified object store.
 *
 * @param {IDBDatabase} db The database.
 * @param {string} storeName The store name.
 * @param {any} value The item value.
 * @param {Object} [options] Options.
 * @param {IDBValidKey} [options.key] Optional key for the item.
 * @param {IDBTransactionDurability} [options.durability="default"] Controls how quickly changes are written to disk.
 * @param {AbortSignal} [options.signal] Abort signal.
 * @returns {Promise<IDBValidKey>} The added item's key.
 * @throws {Error} If the operation is aborted.
 * @throws {TypeError|DOMException} For various errors that could occur accessing the object store.
 */
export async function addItem(db, storeName, value, { durability = 'default', key, signal } = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else {
		const store = getStoreReadWrite(db, storeName, { durability });
		return await handleIDBRequest(store.add(value, key));
	}
}

/**
 * Deletes an item from the specified object store.
 *
 * @param {IDBDatabase} db The database.
 * @param {string} storeName The store name.
 * @param {IDBValidKey|IDBKeyRange|null} query The key or key range of the item to delete.
 * @param {Object} [options] Options.
 * @param {IDBTransactionDurability} [options.durability="default"] Controls how quickly changes are written to disk.
 * @param {AbortSignal} [options.signal] Abort signal.
 * @returns {Promise<void>} A promise that resolves when the deletion is complete.
 * @throws {Error} If the operation is aborted.
 * @throws {TypeError|DOMException} For various errors that could occur accessing the object store.
 */
export async function deleteItem(db, storeName, query, { durability = 'default', signal } = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else {
		const store = getStoreReadWrite(db, storeName, { durability });
		return await handleIDBRequest(store.delete(query));
	}
}

/**
 * Counts records in an object store matching an optional query
 *
 * @param {IDBDatabase} db The database to get the object store from.
 * @param {string} storeName The name of the object store to get the item from.
 * @param {IDBValidKey|IDBKeyRange} query specifies a range of records you want to count.
 * @param {Object} [options] Options for the operation.
 * @param {AbortSignal} [options.signal] An AbortSignal object to monitor for abort events.
 * @returns {Promise<number>} A promise that resolves to the item.
 * @throws {Error} Any error of an aborted signal.
 * @throws {TypeError|DOMException} For various errors that could occur accessing the object store.
 */
export async function count(db, storeName, query, { durability = 'default', signal } = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else {
		const store = getStoreReadOnly(db, storeName, { durability });
		return await handleIDBRequest(store.count(query));
	}
}

/**
 * Gets all keys from the specified object store.
 *
 * @param {IDBDatabase} db The database.
 * @param {string} storeName The store name.
 * @param {Object} [options] Options.
 * @param {IDBValidKey|IDBKeyRange|null} [options.query] The query to filter keys.
 * @param {number|null} [options.count] The maximum number of keys to return.
 * @param {AbortSignal} [options.signal] Abort signal.
 * @returns {Promise<any[]>} A promise that resolves with an array of keys.
 * @throws {Error} If the operation is aborted.
 * @throws {TypeError|DOMException} If errors occur.
 */
export async function getAllKeys(db, storeName, { query, count, signal } = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else {
		const store = getStoreReadOnly(db, storeName);
		return await handleIDBRequest(store.getAllKeys(query, count), { signal });
	}
}
