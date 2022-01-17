// To access your database
// Append api/* to import from api and web/* to import from web
import { getIds } from 'api/src/lib/github'

export default async ({ args }) => {
  // Your script here...
  console.log(':: Executing script with args ::')
  console.log(args)

  const ids = await getIds()
  console.log({ ids })

  Object.entries(ids).forEach(([key, value]) => (process.env[key] = value))
  console.log(process.env)
}
