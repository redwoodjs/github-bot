import { getRepositoryId } from 'api/src/services/github'
import { createActionLabelsInRepository } from 'api/src/services/labels'
import { Cli, Command, Option } from 'clipanion'

export default async () => {
  const [_node, _rwCli, _execCommand, _scriptName, _prismaFlag, ...args] =
    process.argv

  const cli = new Cli()
  cli.register(AddActionLabels)
  cli.runExit(args)
}

class AddActionLabels extends Command {
  owner = Option.String('--owner', { required: true })
  name = Option.String('--name', { required: true })

  async execute() {
    const id = await getRepositoryId({
      owner: this.owner,
      name: this.name,
    })

    this.context.stdout.write(`${id}\n`)

    const labels = await createActionLabelsInRepository(id)

    this.context.stdout.write(`${JSON.stringify(labels, null, 2)}\n`)
  }
}
