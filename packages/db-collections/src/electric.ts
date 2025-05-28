import {
  ShapeStream,
  isChangeMessage,
  isControlMessage,
} from "@electric-sql/client"
import { Store } from "@tanstack/store"
import { Collection, collectionsStore } from "@tanstack/db"
import type { ChangeMessage, CollectionConfig, SyncConfig } from "@tanstack/db"
import type {
  ControlMessage,
  Message,
  Row,
  ShapeStreamOptions,
} from "@electric-sql/client"

/**
 * Configuration interface for ElectricCollection
 */
export interface ElectricCollectionConfig<T extends Row<unknown>>
  extends Omit<CollectionConfig<T>, `sync`> {
  /**
   * Configuration options for the ElectricSQL ShapeStream
   */
  streamOptions: ShapeStreamOptions

  /**
   * Array of column names that form the primary key of the shape
   */
  primaryKey: Array<string>

  /**
   * Optional initial data to load before starting Electric sync
   * This data will be inserted into the collection immediately
   */
  initialData?: Array<T>
}

/**
 * Specialized Collection class for ElectricSQL integration
 */
export class ElectricCollection<
  T extends Row<unknown> = Record<string, unknown>,
> extends Collection<T> {
  private seenTxids: Store<Set<number>>

  constructor(config: ElectricCollectionConfig<T>) {
    const seenTxids = new Store<Set<number>>(new Set([Math.random()]))
    const sync = createElectricSync<T>(config.streamOptions, {
      primaryKey: config.primaryKey,
      seenTxids,
      initialData: config.initialData,
    })

    super({ ...config, sync })

    this.seenTxids = seenTxids
  }

  /**
   * Wait for a specific transaction ID to be synced
   * @param txId The transaction ID to wait for
   * @param timeout Optional timeout in milliseconds (defaults to 30000ms)
   * @returns Promise that resolves when the txId is synced
   */
  async awaitTxId(txId: number, timeout = 30000): Promise<boolean> {
    const hasTxid = this.seenTxids.state.has(txId)
    if (hasTxid) return true

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unsubscribe()
        reject(new Error(`Timeout waiting for txId: ${txId}`))
      }, timeout)

      const unsubscribe = this.seenTxids.subscribe(() => {
        if (this.seenTxids.state.has(txId)) {
          clearTimeout(timeoutId)
          unsubscribe()
          resolve(true)
        }
      })
    })
  }
}

function isUpToDateMessage<T extends Row<unknown> = Row>(
  message: Message<T>
): message is ControlMessage & { up_to_date: true } {
  return isControlMessage(message) && message.headers.control === `up-to-date`
}

// Check if a message contains txids in its headers
function hasTxids<T extends Row<unknown> = Row>(
  message: Message<T>
): message is Message<T> & { headers: { txids?: Array<number> } } {
  return (
    `headers` in message &&
    `txids` in message.headers &&
    Array.isArray(message.headers.txids)
  )
}

/**
 * Creates an ElectricSQL sync configuration
 *
 * @param streamOptions - Configuration options for the ShapeStream
 * @param options - Options for the ElectricSync configuration
 * @returns ElectricSync configuration
 */
/**
 * Create a new ElectricCollection instance
 */
export function createElectricCollection<T extends Row<unknown>>(
  config: ElectricCollectionConfig<T>
): ElectricCollection<T> {
  return new ElectricCollection(config)
}

/**
 * Internal function to create ElectricSQL sync configuration
 */
function createElectricSync<T extends Row<unknown>>(
  streamOptions: ShapeStreamOptions,
  options: {
    primaryKey: Array<string>
    seenTxids: Store<Set<number>>
    initialData?: Array<T>
  }
): SyncConfig<T> {
  const { primaryKey, seenTxids, initialData } = options

  // Store for the relation schema information
  const relationSchema = new Store<string | undefined>(undefined)

  /**
   * Get the sync metadata for insert operations
   * @returns Record containing primaryKey and relation information
   */
  const getSyncMetadata = (): Record<string, unknown> => {
    // Use the stored schema if available, otherwise default to 'public'
    const schema = relationSchema.state || `public`

    return {
      primaryKey,
      relation: streamOptions.params?.table
        ? [schema, streamOptions.params.table]
        : undefined,
    }
  }

  return {
    sync: (params: {
      collection: Collection<T>
      begin: () => void
      write: (message: ChangeMessage<T>) => void
      commit: () => void
    }) => {
      const { begin, write, commit } = params
      let hasLoadedInitialData = false

      // Function to load initial data
      const loadInitialData = () => {
        if (initialData && initialData.length > 0 && !hasLoadedInitialData) {
          console.log(
            `Loading initial data before Electric sync... ${params.collection.id}`
          )
          console.log(`Initial data type:`, typeof initialData)
          console.log(`Initial data length:`, initialData.length)

          // Try different logging approaches to see what works
          console.log(`Initial data (JSON.stringify):`)
          try {
            console.log(JSON.stringify(initialData, null, 2))
          } catch (e) {
            console.log(`Failed to JSON.stringify initialData:`, e)
          }

          console.log(`Initial data (direct):`, initialData)

          // Check for Date objects specifically
          console.log(`Initial data items:`)
          initialData.forEach((item, index) => {
            console.log(`Item ${index}:`, item)
            console.log(`Item ${index} keys:`, Object.keys(item))
            console.log(`Item ${index} values:`, Object.values(item))
          })

          begin()
          initialData.forEach((item) => {
            // Generate key from primary key fields
            const key = primaryKey.map((field) => String(item[field])).join(`/`)

            write({
              type: `insert`,
              key,
              value: item,
              metadata: {
                source: `initial_data`,
                primaryKey,
              },
            })
          })
          commit()

          hasLoadedInitialData = true
          console.log(`Loaded ${initialData.length} initial items`)
        }
      }

      // Load initial data first
      loadInitialData()

      // Then start Electric sync
      const stream = new ShapeStream(streamOptions)
      let transactionStarted = false
      let newTxids = new Set<number>()

      stream.subscribe((messages: Array<Message<Row>>) => {
        let hasUpToDate = false

        for (const message of messages) {
          // Check for txids in the message and add them to our store
          if (hasTxids(message) && message.headers.txids) {
            message.headers.txids.forEach((txid) => newTxids.add(txid))
          }

          // Check if the message contains schema information
          if (isChangeMessage(message) && message.headers.schema) {
            // Store the schema for future use if it's a valid string
            if (typeof message.headers.schema === `string`) {
              const schema: string = message.headers.schema
              relationSchema.setState(() => schema)
            }
          }

          if (isChangeMessage(message)) {
            if (!transactionStarted) {
              begin()
              transactionStarted = true
            }

            const key = message.key

            // Include the primary key and relation info in the metadata
            const enhancedMetadata = {
              ...message.headers,
              primaryKey,
              source: `electric_sync`,
            }

            write({
              key,
              type: message.headers.operation,
              value: message.value as unknown as T,
              metadata: enhancedMetadata,
            })
          } else if (isUpToDateMessage(message)) {
            hasUpToDate = true
          }
        }

        if (hasUpToDate && transactionStarted) {
          commit()
          seenTxids.setState((currentTxids) => {
            const clonedSeen = new Set(currentTxids)
            newTxids.forEach((txid) => clonedSeen.add(txid))

            newTxids = new Set()
            return clonedSeen
          })
          transactionStarted = false
        }
      })
    },
    // Expose the getSyncMetadata function
    getSyncMetadata,
  }
}

/**
 * Configuration options for ElectricSync
 */
export interface ElectricSyncOptions {
  /**
   * Array of column names that form the primary key of the shape
   */
  primaryKey: Array<string>
}

/**
 * Example usage of ElectricCollection with initial data:
 *
 * ```typescript
 * interface Todo extends Row<unknown> {
 *   id: string
 *   text: string
 *   completed: boolean
 *   created_at: string
 * }
 *
 * // Your initial data - could come from localStorage, API call, etc.
 * const initialTodos: Todo[] = [
 *   {
 *     id: "todo-1",
 *     text: "Buy groceries",
 *     completed: false,
 *     created_at: "2024-01-01T10:00:00Z"
 *   },
 *   {
 *     id: "todo-2",
 *     text: "Walk the dog",
 *     completed: true,
 *     created_at: "2024-01-01T11:00:00Z"
 *   }
 * ]
 *
 * // Create collection with initial data
 * const todoCollection = new ElectricCollection<Todo>({
 *   id: "todos-with-initial-data",
 *   streamOptions: {
 *     url: "http://localhost:3000",
 *     params: {
 *       table: "todos"
 *     }
 *   },
 *   primaryKey: ["id"],
 *   initialData: initialTodos // Initial data will be loaded immediately
 * })
 *
 * // Access the data - initial data will be available right away
 * todoCollection.toArrayWhenReady().then(todos => {
 *   console.log("Todos in collection:", todos)
 *   // Will show initial data immediately, then sync with Electric
 * })
 *
 * // Subscribe to changes (will get initial data first, then Electric updates)
 * const unsubscribe = todoCollection.subscribeChanges(changes => {
 *   console.log("Collection changes:", changes)
 *   // First call: initial data as 'insert' operations
 *   // Subsequent calls: real-time updates from Electric
 * })
 *
 * // Loading from other sources:
 *
 * // From localStorage
 * const loadFromStorage = (): Todo[] => {
 *   const stored = localStorage.getItem('cached-todos')
 *   return stored ? JSON.parse(stored) : []
 * }
 *
 * // From a Map
 * const dataMap = new Map<string, Todo>([
 *   ["todo-1", { id: "todo-1", text: "Task 1", completed: false, created_at: "2024-01-01T10:00:00Z" }],
 *   ["todo-2", { id: "todo-2", text: "Task 2", completed: true, created_at: "2024-01-01T11:00:00Z" }]
 * ])
 * const initialFromMap = Array.from(dataMap.values())
 *
 * // Create collection with data from any source
 * const collectionFromStorage = new ElectricCollection<Todo>({
 *   id: "todos-from-storage",
 *   streamOptions: { url: "http://localhost:3000", params: { table: "todos" } },
 *   primaryKey: ["id"],
 *   initialData: loadFromStorage() // or initialFromMap
 * })
 * ```
 */
