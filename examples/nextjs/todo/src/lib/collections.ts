import { createElectricCollection } from "@tanstack/db-collections"
import { updateConfigSchema, updateTodoSchema } from "../db/validation"
import type { ElectricCollection } from "@tanstack/db-collections"
import type { PendingMutation } from "@tanstack/react-db"
import type { UpdateConfig, UpdateTodo } from "../db/validation"

// Function to create Electric todo collection with initial data
export const createTodoCollection = (initialData: Array<UpdateTodo>) => {
  // Construct full URL for Electric client
  const isClient = typeof window !== `undefined`
  const baseUrl = isClient ? window.location.origin : `http://localhost:3000`

  const newCollection = createElectricCollection<UpdateTodo>({
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
    initialData,
  })
  return newCollection
}

// Function to create Electric config collection with initial data
export const createConfigCollection = (initialData: Array<UpdateConfig>) => {
  // Construct full URL for Electric client
  const isClient = typeof window !== `undefined`
  const baseUrl = isClient ? window.location.origin : `http://localhost:3000`
  const newCollection = createElectricCollection<UpdateConfig>({
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
    initialData,
  })
  return newCollection
}

// Handle syncing changes to Electric
export async function collectionSync(mutation: PendingMutation, txid: number) {
  await (mutation.collection as ElectricCollection<UpdateTodo>).awaitTxId(txid)
}
