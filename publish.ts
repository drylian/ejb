import { glob } from 'glob'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { inc } from 'semver'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

class Publisher {
  private readonly CLI = '\x1b[34mCLI\x1b[0m'
  private readonly VERSION = '\x1b[32mVERSION\x1b[0m'
  private readonly PUBLISH = '\x1b[35mPUBLISH\x1b[0m'

  constructor() {}

  private async updateVersion(pkgPath: string): Promise<void> {
    const content = await readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(content)
    
    // Incrementa a versão patch usando semver
    const newVersion = inc(pkg.version, 'patch')
    if (!newVersion) {
      throw new Error(`Failed to increment version for ${pkgPath}`)
    }

    console.log(`${this.VERSION} Updating ${pkg.name} from ${pkg.version} to ${newVersion}`)
    pkg.version = newVersion

    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    console.log(`${this.VERSION} Updated ${pkgPath}`)
  }

  private async publishPackage(pkgPath: string): Promise<void> {
    try {
      const content = await readFile(join(pkgPath, 'package.json'), 'utf-8')
      const pkg = JSON.parse(content)
      
      console.log(`${this.PUBLISH} Publishing ${pkg.name}@${pkg.version}`)
      
      // Executa npm publish na pasta publish/[package]
      await execAsync('npm publish --access public', {
        cwd: join('publish', pkgPath.split('/').pop() || '')
      })
      
      console.log(`${this.PUBLISH} Successfully published ${pkg.name}@${pkg.version}`)
    } catch (error) {
      console.error(`${this.PUBLISH} Failed to publish ${pkgPath}:`, error)
      throw error
    }
  }

  public async publish(): Promise<void> {
    try {
      // Primeiro atualiza todas as versões
      const packages = await glob(['packages/*/', 'core'])
      console.log(`${this.CLI} Found packages:`, packages)

      for (const pkg of packages) {
        await this.updateVersion(join(pkg, 'package.json'))
      }

      // Executa o build para garantir que tudo está atualizado
      console.log(`${this.CLI} Running build...`)
      await execAsync('bun run build')
      console.log(`${this.CLI} Build completed`)

      // Publica os pacotes
      for (const pkg of packages) {
        await this.publishPackage(pkg)
      }

      console.log(`${this.CLI} All packages have been published successfully!`)
    } catch (error) {
      console.error(`${this.CLI} Failed to publish packages:`, error)
      process.exit(1)
    }
  }
}

// Execute publish
const publisher = new Publisher()
publisher.publish().catch(console.error) 