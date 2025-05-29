import { createElectricCollection } from "@tanstack/db-collections"
import { updateConfigSchema, updateTodoSchema } from "../db/validation"
import type { CollectionClient } from "./CollectionClientProvider"
import type { UpdateConfig, UpdateTodo } from "../db/validation"

export interface CreateCollectionClientOptions {
  defaultOptions?: {
    staleTime?: number
    // Add other collection-specific options as needed
  }
}

export function createCollectionClient(
  initialTodos: Array<UpdateTodo> = [],
  initialConfig: Array<UpdateConfig> = [],
  options: CreateCollectionClientOptions = {}
): CollectionClient {
  // Construct full URL for Electric client
  const isClient = typeof window !== `undefined`
  const baseUrl = isClient ? window.location.origin : `http://localhost:3000`

  // Create todo collection
  const todoCollection = createElectricCollection<UpdateTodo>({
    id: `todos`,
    streamOptions: {
      url: `${baseUrl}/api/electric`,
      params: {
        table: `todos`,
      },
      subscribe: isClient,
    },
    primaryKey: [`id`],
    schema: updateTodoSchema,
    initialData: initialTodos,
  })

  // Create config collection
  const configCollection = createElectricCollection<UpdateConfig>({
    id: `config`,
    streamOptions: {
      url: `${baseUrl}/api/electric`,
      params: {
        table: `config`,
      },
      subscribe: isClient,
    },
    primaryKey: [`id`],
    schema: updateConfigSchema,
    initialData: initialConfig,
  })

  const client: CollectionClient = {
    todoCollection,
    configCollection,
    mount() {
      // Any setup logic when the client is mounted
      console.log(`Collection client mounted`)
    },
    unmount() {
      // Any cleanup logic when the client is unmounted
      console.log(`Collection client unmounted`)
    },
    getAllCollections() {
      return {
        todos: todoCollection,
        config: configCollection,
      }
    },
  }

  return client
}

// Helper function to dehydrate collection state (similar to React Query's dehydrate)
export function dehydrateCollections(client: CollectionClient) {
  const collections = client.getAllCollections()
  const dehydratedState: Record<string, Array<any>> = {}

  Object.entries(collections).forEach(([key, collection]) => {
    dehydratedState[key] = Array.from(collection.state.values())
  })

  return dehydratedState
}
