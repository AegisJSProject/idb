export const DEFAULT_DB_VERSION = 1;

/**
 * Opt-in to implementing the disposal protocol on `IDBDatabase`. This will enable
 * automatic closure of a DB when it leaves scope via `using db = ...`.
 *
 * @returns {boolean} Whether or not the disposal method was successfully added.
 */
export function makeDisposable() {
	if (typeof Symbol.dispose === 'symbol' && typeof IDBDatabase.prototype[Symbol.dispose] === 'undefined') {
		IDBDatabase.prototype[Symbol.dispose] = function() {
			this.close();
		};

		return true;
	} else {
		return false;
	}
}

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
 * Creates a new object store in the provided IndexedDB database. If an object store with the given name already exists, it returns null.
 *
 * @param {IDBDatabase} db The IndexedDB database instance.
 * @param {string} name The name of the object store to create.
 * @param {object} options Configuration options for the object store.
 * @param {string} [options.keyPath] The key path for the object store.
 * @param {boolean} [options.autoIncrement=false] Whether the object store should auto-increment keys.
 * @param {Object<string, {keyPath:string|string[],unique?:boolean,multiEntry?:boolean}>} [options.indexes] An object defining indexes for the object store. The keys of this object are the index names, and the values are objects with `keyPath`, `unique`, and `multiEntry` properties.
 * @returns {IDBObjectStore|null} The created IDBObjectStore, or null if an object store with the given name already exists.
 * @throws {DOMException} If in error occurs in handling the request.
 */
export function createStore(db, name, {
	keyPath,
	autoIncrement = false,
	indexes,
} = {}) {
	if (! db.objectStoreNames.contains(name)) {
		const store = db.createObjectStore(name, { keyPath, autoIncrement });

		if  (typeof indexes === 'object') {
			for (const [index, { keyPath, unique = false, multiEntry = false }] of Object.entries(indexes)) {
				store.createIndex(index, keyPath, { unique, multiEntry });
			}
		}
	} else {
		return null;
	}
}

/**
 * Deletes an object store from the provided IndexedDB database.
 *
 * @param {IDBDatabase} db The IndexedDB database instance.
 * @param {string} store The name of the object store to delete.
 * @returns {boolean} Returns true if the store was deleted, false if it did not exist.
 */
export function deleteStore(db, store) {
	if (db.objectStoreNames.contains(store)) {
		db.deleteObjectStore(store);
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

	if (! (request instanceof IDBRequest)) {
		reject(new TypeError('Request must be an `IDBRequest`.'));
	} else if (passedSignal instanceof AbortSignal && passedSignal.aborted) {
		reject(passedSignal.reason);
	} else {
		const controller = new AbortController();

		try {
			const signal = passedSignal instanceof AbortSignal
				? AbortSignal.any([passedSignal, controller.signal])
				: controller.signal;

			request.addEventListener('success', ({ target }) => {
				resolve(target.result);
				controller.abort();
			}, { signal, once: true });

			request.addEventListener('error', ({ target }) => {
				abortTransaction(target.transaction);
				controller.abort(target.error);
				reject(target.error);
			}, { signal, once: true });

			if (passedSignal instanceof AbortSignal) {
				passedSignal.addEventListener('abort', ({ target }) => {
					reject(target.reason);
					abortTransaction(target.reason);
				}, { signal: controller.signal, once: true });
			}
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
 * @param {object} [config.schema] The database schema configuration.
 * @param {string} [config.schema.name] The name of the database.
 * @param {number} [config.schema.version] The version of the database.
 * @param {object<string, Object>} [config.schema.stores] Object stores in the database.
 * @param {string} [config.schema.stores[].keyPath] The key path for the object store.
 * @param {boolean} [config.schema.stores[].autoIncrement=false] Whether the store's key should auto-increment.
 * @param {object<string, Object>} [config.schema.stores[].indexes] Indexes for the object store.
 * @param {string} [config.schema.stores[].indexes[].keyPath] The key path for the index.
 * @param {boolean} [config.schema.stores[].indexes[].multiEntry=false] Whether the index allows multiple entries.
 * @param {boolean} [config.schema.stores[].indexes[].unique=false] Whether the index enforces unique values.
 * @param {DisposableStack|AsyncDisposableStack} [config.stack] Optional `DisposableStack` to close DB when the stack is disposed.
 * @param {AbortSignal} [config.signal)] An AbortSignal object to monitor for abort events.
 * @returns {Promise<IDBDatabase>} A promise that resolves to the opened IDBDatabase object.
 * @throws {Error} Any error of an aborted signal.
 * @throws {DOMException} If in error occurs in handling the request.
 */
export async function openDB(name, {
	version = DEFAULT_DB_VERSION,
	onUpgrade,
	schema,
	stack,
	signal,
} = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else {
		const request = indexedDB.open(name, version);

		if (typeof schema === 'object') {
			request.addEventListener('upgradeneeded', ({ target }) => upgradeDB(target, schema), { once: true, signal });
		}

		if (onUpgrade instanceof Function) {
			request.addEventListener('upgradeneeded', onUpgrade, { signal, once: true });
		}

		if ('DisposableStack' in globalThis && (stack instanceof DisposableStack || stack instanceof AsyncDisposableStack)) {
			return stack.adopt(await handleIDBRequest(request, { signal }), db => db.close());
		} else {
			return await handleIDBRequest(request, { signal });
		}
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
export const getStoreReadWrite = (db, storeName, { durability = 'default' } = {}) => getStore(db, storeName, { mode: 'readwrite', durability });

/**
 * Clears all data from the specified object store in the given IndexedDB database.
 *
 * @param {IDBDatabase} db The IndexedDB database instance.
 * @param {string} name The name of the object store to clear.
 * @param {object} [options] Optional parameters.
 * @param {AbortSignal} [options.signal] An AbortSignal to allow cancellation of the operation.
 * @return {Promise<void>} A Promise that resolves when the store is cleared.
 * @throws {Error} Any error of an aborted signal.
 * @throws {DOMException} If in error occurs in handling the request.
 */
export async function clearStore(db, name, { signal } = {}) {
	const store = getStoreReadWrite(db, name);
	await handleIDBRequest(store.clear(), { signal });
}

/**
 * Gets an item from the given object store.
 *
 * @param {IDBDatabase} db The database to get the object store from.
 * @param {string} storeName The name of the object store to get the item from.
 * @param {IDBValidKey|IDBKeyRange} key The key of the item to get.
 * @param {Object} [options] Options for the operation.
 * @param {AbortSignal} [options.signal] An AbortSignal object to monitor for abort events.
 * @param {any} [options.fallback=null] A default value to return if the item is not found.
 * @returns {Promise<any>} A promise that resolves to the item.
 * @throws {Error} Any error of an aborted signal.
 * @throws {TypeError|DOMException} For various errors that could occur accessing the object store.
 */
export async function getItem(db, storeName, key, { signal, fallback } = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else {
		const store = getStoreReadOnly(db, storeName);
		return await handleIDBRequest(store.get(key), { signal }) ?? fallback;
	}
}

/**
 * Gets all items from the given object store.
 *
 * @param {IDBDatabase} db The database to get the object store from.
 * @param {string} storeName The name of the object store to get items from.
 * @param {IDBValidKey|IDBKeyRange|null} query The query to use to filter items.
 * @param {Object} [options] Options for the operation.
 * @param {string} [options.indexName] Optional index for the query.
 * @param {number|null} [options.count] The maximum number of items to return.
 * @param {AbortSignal} [options.signal] An AbortSignal object to monitor for abort events.
 * @returns {Promise<any[]>} A promise that resolves to an array of items.
 * @throws {Error} If the AbortSignal is aborted.
 * @throws {TypeError|DOMException} For various errors that could occur accessing the object store.
 */
export async function getAllItems(db, storeName, query, { indexName, count, signal } = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else if (typeof indexName === 'string' && indexName.length !== 0) {
		const store = getStoreReadOnly(db, storeName);
		const index = store.index(indexName);
		return await handleIDBRequest(index.getAll(query, count));
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
export async function putItem(db, storeName, value, { key, durability = 'default', signal } = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else {
		const store = getStoreReadWrite(db, storeName, { durability });
		return await handleIDBRequest(store.put(value, key));
	}
}

/**
 * Bulk puts items into the specified object store using a single transaction.
 *
 * @param {IDBDatabase} db The database.
 * @param {string} storeName The store name.
 * @param {any[]} items The items to add/update.
 * @param {Object} [options] Options.
 * @param {IDBTransactionDurability} [options.durability="default"] Controls how quickly changes are written to disk.
 * @param {AbortSignal} [options.signal] Abort signal.
 * @returns {Promise<IDBValidKey[]>} A promise that resolves with an array of keys.
 */
export async function putAllItems(db, storeName, items, { durability = 'default', signal } = {}) {
	if (! Array.isArray(items)) {
		throw new TypeError('Items must be an array.');
	} else if (items.length === 1) {
		return [await putItem(db, storeName, items[0], { durability, signal: signal })];
	} else if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else if (items.length === 0) {
		return [];
	} else {
		const { resolve, reject, promise } = Promise.withResolvers();
		const controller = new AbortController();

		try {
			const store = getStoreReadWrite(db, storeName, { durability });
			const transaction = store.transaction;
			const promises = new Array(items.length);

			transaction.addEventListener('error', ({ target }) => {
				controller.abort(target.error);
				reject(target.error);
				target.abort();
			}, { once: true, signal: controller.signal });

			transaction.addEventListener('abort', ({ target }) => {
				controller.abort(target.error);
				reject(target.error);
			}, { once: true, signal: controller.signal });

			transaction.addEventListener('complete', () => {
				Promise.all(promises)
					.then(resolve, reject)
					.finally(() => controller.abort());
			}, { once: true, signal: controller.signal });

			if (signal instanceof AbortSignal) {
				signal.addEventListener('abort', ({ target }) => {
					reject(target.reason);
					controller.abort(target.reason);
					transaction.abort();
				}, { once: true, signal: controller.signal });
			}

			for (let i = 0; i < items.length; i++) {
				if (controller.signal.aborted) {
					promises[i] = Promise.reject(controller.signal.reason);
				} else {
					const { resolve, reject, promise } = Promise.withResolvers();
					const reqController = new AbortController();
					const req = store.put(items[i]);
					promises[i] = promise;

					req.addEventListener('success', ({ target }) => {
						resolve(target.result);
						reqController.abort();
					}, { once: true, signal: reqController.signal });

					req.addEventListener('error', ({ target }) => {
						reject(target.error);
						reqController.abort(target.error);
						controller.abort(target.error);
						transaction.abort();
					}, { once: true, signal: reqController.signal });
				}
			}
		} catch(err) {
			controller.abort(err);
			reject(err);
		}

		return promise;
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

/**
 * Opens an IDB Cursor as an asynchronous iterable, allowing iteration over the results of a database query.
 * Note that iterating/consuming **MUST** be synchronous to keep the transaction open.
 *
 * @async
 * @generator
 * @param {IDBDatabase} db The IndexedDB database.
 * @param {string} storeName The name of the object store.
 * @param {object} [options] Options for the cursor.
 * @param {IDBTransactionMode} [options.mode="readonly"] The transaction mode.
 * @param {IDBTransactionDurability} [options.durability="default"] The transaction durability.
 * @param {IDBKeyRange|IDBValidKey|null} [options.query=null] The key range to use for the cursor.
 * @param {IDBCursorDirection} [options.direction="next"] The cursor direction.
 * @param {AbortSignal} [options.signal] An AbortSignal to allow aborting the operation.
 * @yields {IDBCursorWithValue} The current cursor value.
 * @throws {Error} If the operation is aborted via the AbortSignal or if an error occurs during the transaction or cursor operation.
 */
export async function *iterateObjectStore(db, storeName, {
	mode = 'readonly',
	durability = 'default',
	query = null,
	direction = 'next',
	signal,
} = {}) {
	if (db instanceof IDBOpenDBRequest) {
		yield *iterateObjectStore(db.result, storeName, { mode, durability, query, direction, signal });
	} else if (! (db instanceof IDBDatabase)) {
		throw new TypeError('Not an IDBDatabase instance.');
	} else if (typeof storeName !== 'string' || storeName.length === 0) {
		throw new TypeError('Store name must be a non-empty string.');
	} else if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else {
		const abrt = new AbortController();
		const sig = signal instanceof AbortSignal ? AbortSignal.any([signal, abrt.signal]) : abrt.signal;
		const transaction = db.transaction(storeName, mode, { durability });
		const store = transaction.objectStore(storeName);
		const cursorRequest = store.openCursor(query, direction);
		let deferred;

		yield *new ReadableStream({
			start(controller) {
				transaction.addEventListener('abort', ({ target }) => {
					controller.error(target.error);
					abrt.abort(target.error);
				}, { signal: sig });

				transaction.addEventListener('error', ({ target }) => {
					controller.error(target.error);
					abrt.abort(target.error);
				}, { signal: sig });

				cursorRequest.addEventListener('success', async ({ target }) => {
					deferred = Promise.withResolvers();

					if (target.result instanceof IDBCursorWithValue) {
						controller.enqueue(target.result);
						await deferred.promise;
						target.result.continue();
					} else {
						controller.close();
						abrt.abort();
					}
				}, { signal: sig });

				cursorRequest.addEventListener('error', ({ target }) => {
					controller.error(target.error);
					abrt.abort(target.error);
				}, { signal: sig });

				if (signal instanceof AbortSignal) {
					signal.addEventListener('abort', ({ target }) => {
						controller.error(target.reason);
						abrt.abort(target.reason);

						// No need to abort if read-only
						if (transaction.mode !== 'readonly') {
							transaction.abort();
						}
					}, { signal: abrt.signal });
				}
			},
			pull() {
				if (deferred?.resolve instanceof Function) {
					deferred.resolve();
				}
			},
			cancel(reason) {
				abrt.abort(reason);
				transaction.abort();
			}
		});
	}
}

/**
 * Upgrades an `IDBDatabase` on `IDBOpenDBRequest` using a database schema object.
 *
 * @param {IDBOpenDBRequest} req The result of an `indexedDB.open()` request.
 * @param {Object} schema The database schema configuration.
 * @param {string} schema.name The name of the database.
 * @param {number} schema.version The version of the database.
 * @param {Object<string, Object>} schema.stores Object stores in the database.
 * @param {string} schema.stores[].keyPath The key path for the object store.
 * @param {boolean} [schema.stores[].autoIncrement=false] Whether the store's key should auto-increment.
 * @param {Object<string, {keyPath:string|string[],unique?:boolean,multiEntry?:boolean}>} [schema.stores.indexes] Indexes for the object store.
 * @param {string} schema.stores[].indexes[].keyPath The key path for the index.
 * @param {boolean} [schema.stores[].indexes[].multiEntry=false] Whether the index allows multiple entries.
 * @param {boolean} [schema.stores[].indexes[].unique=false] Whether the index enforces unique values.
 * @throws {DOMException} If in error occurs in handling the request.
 */
export function upgradeDB(req, schema) {
	if (! (req instanceof IDBOpenDBRequest)) {
		throw new TypeError('Not an `IDBOpenDBRequest`.');
	} else if (typeof schema !== 'object') {
		throw new TypeError('Invalid DB schema type.');
	} else if (typeof schema.stores === 'object') {
		try {
			for (const storeName of req.result.objectStoreNames) {
				if (! schema.stores.hasOwnProperty(storeName)) {
					req.result.deleteObjectStore(storeName);
				}
			}

			for (const [name, { keyPath, autoIncrement = false, indexes = {} }] of Object.entries(schema.stores)) {
				if (! req.result.objectStoreNames.contains(name)) {
					const store = req.result.createObjectStore(name, { keyPath, autoIncrement });

					for (const [iName, { keyPath: iKeyPath, unique = false, multiEntry = false }] of Object.entries(indexes)) {
						store.createIndex(iName, iKeyPath ?? iName, { unique, multiEntry });
					}
				} else {
					const store = req.transaction.objectStore(name);

					for (const index of store.indexNames) {
						if (! indexes.hasOwnProperty(index)) {
							store.deleteIndex(index);
						}
					}

					for (const [iName, { keyPath: iKeyPath, unique = false, multiEntry = false }] of Object.entries(indexes)) {
						if (! store.indexNames.contains(iName)) {
							store.createIndex(iName, iKeyPath ?? iName, { unique, multiEntry });
						}
					}
				}
			}
		} catch(err) {
			req.transaction.abort();
			reportError(err);
		}
	} else if (typeof schema[req.result.name] === 'object') {
		upgradeDB(req, schema[req.result]);
	} else {
		throw new TypeError('Invalid DB schema object.');
	}
}
