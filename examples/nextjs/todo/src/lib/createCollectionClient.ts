import { createElectricCollection } from "@tanstack/db-collections"
import { updateConfigSchema, updateTodoSchema } from "../db/validation"
import type { CollectionClient } from "./CollectionClientProvider"
import type { UpdateConfig, UpdateTodo } from "../db/validation"

export interface CreateCollectionClientOptions {
  defaultOptions?: {
    staleTime?: number
  }
}

export function createCollectionClient(
  initialTodos: Array<UpdateTodo> = [],
  initialConfig: Array<UpdateConfig> = [],
  options: CreateCollectionClientOptions = {}
): CollectionClient {
  const isClient = typeof window !== `undefined`
  const baseUrl = isClient ? window.location.origin : `http://localhost:3000`

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
    mount() {},
    unmount() {},
    getAllCollections() {
      return {
        todos: todoCollection,
        config: configCollection,
      }
    },
  }

  return client
}

export function dehydrateCollections(client: CollectionClient) {
  const collections = client.getAllCollections()
  const dehydratedState: Record<string, Array<any>> = {}

  Object.entries(collections).forEach(([key, collection]) => {
    dehydratedState[key] = Array.from(collection.state.values())
  })

  return dehydratedState
}
