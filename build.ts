import { exec } from 'child_process'
import * as esbuild from 'esbuild'
import { existsSync } from 'fs'
import { cp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { glob } from 'glob'
import JSON5 from 'json5'
import { dirname, join, relative } from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface PackageInfo {
  name: string
  version: string
  path: string
  publishPath: string
}

interface WorkspaceDependency {
  name: string
  workspacePath: string
  targetVersion: string
}

class PackageRegistry {
  private packages = new Map<string, PackageInfo>()
  
  async discoverPackages(): Promise<void> {
    const packagePaths = await glob(['packages/*/', 'core'])
    
    for (const packagePath of packagePaths) {
      const pkgJsonPath = join(packagePath, 'package.json')
      if (!existsSync(pkgJsonPath)) continue
      
      const content = await readFile(pkgJsonPath, 'utf-8')
      const pkg = JSON.parse(content)
      
      const packageName = packagePath.split('/').pop() || packagePath
      const publishPath = `publish/${packageName}`
      
      this.packages.set(pkg.name, {
        name: pkg.name,
        version: pkg.version,
        path: packagePath,
        publishPath
      })
      
      console.log(`📦 Discovered package: ${pkg.name}@${pkg.version} at ${packagePath} -> ${publishPath}`)
    }
  }
  
  getPackageByName(name: string): PackageInfo | undefined {
    return this.packages.get(name)
  }
  
  getAllPackages(): PackageInfo[] {
    return Array.from(this.packages.values())
  }
  
  resolveWorkspaceDependencies(packagePath: string): Promise<WorkspaceDependency[]> {
    return this.extractWorkspaceDeps(packagePath)
  }
  
  private async extractWorkspaceDeps(packagePath: string): Promise<WorkspaceDependency[]> {
    const pkgJsonPath = join(packagePath, 'package.json')
    const content = await readFile(pkgJsonPath, 'utf-8')
    const pkg = JSON.parse(content)
    
    const workspaceDeps: WorkspaceDependency[] = []
    
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
      const deps = pkg[field] as Record<string, string>
      if (!deps) continue
      
      for (const [depName, depVersion] of Object.entries(deps)) {
        if (typeof depVersion === 'string' && depVersion.startsWith('workspace:')) {
          const targetPackage = this.getPackageByName(depName)
          if (targetPackage) {
            workspaceDeps.push({
              name: depName,
              workspacePath: depVersion,
              targetVersion: targetPackage.version
            })
          } else {
            console.warn(`⚠️  Workspace dependency ${depName} not found in registry`)
          }
        }
      }
    }
    
    return workspaceDeps
  }
}

class TypeScriptBuilder {
  private readonly TYPES = '\x1b[35mTYPES\x1b[0m'
  
  async generateTypes(): Promise<void> {
    console.log(`${this.TYPES} Generating TypeScript declarations...`)
    
    try {
      if (existsSync('core/dist')) {
        console.log(`${this.TYPES} Cleaning up old dist directory...`)
        await rm('core/dist', { recursive: true })
        console.log(`${this.TYPES} Cleaned dist directory`)
      }

      await execAsync('tsc -p core/tsconfig.build.json --noEmit false')
      console.log(`${this.TYPES} TypeScript declarations generated successfully`)
    } catch (error) {
      console.error(`${this.TYPES} Error generating TypeScript declarations:`, error)
      throw error
    }
  }

  async copyTypesToPublish(): Promise<void> {
    console.log(`${this.TYPES} Copying type definitions to publish directory...`)

    if (existsSync('core/dist/types/core/src')) {
      await mkdir('publish/core/dist/types', { recursive: true })
      const coreFiles = await glob('core/dist/types/core/src/**/*.ts')
      
      for (const file of coreFiles) {
        const relativePath = file.replace('core/dist/types/core/src/', '')
        const targetPath = join('publish/core/dist/types', relativePath)
        await mkdir(dirname(targetPath), { recursive: true })
        await cp(file, targetPath)
      }
    }

    const packages = await glob('core/dist/types/packages/*')
    for (const packagePath of packages) {
      const packageName = packagePath.split('/').pop()
      if (!packageName) continue

      const sourceFiles = await glob(`${packagePath}/src/**/*.ts`)
      const targetBase = `publish/${packageName}/dist/types`
      
      for (const file of sourceFiles) {
        const relativePath = file.replace(`${packagePath}/src/`, '')
        const targetPath = join(targetBase, relativePath)
        await mkdir(dirname(targetPath), { recursive: true })
        await cp(file, targetPath)
      }
    }

    console.log(`${this.TYPES} Type definitions copied to publish directory`)
  }

  async mergeTsConfig(packageInfo: PackageInfo): Promise<void> {
    const CLI = '\x1b[34mCLI\x1b[0m'
    const { path: packagePath, publishPath } = packageInfo
    const baseConfigPath = join(process.cwd(), 'packages/tsconfig.base.json')
    const packageConfigPath = join(packagePath, 'tsconfig.json')
    
    console.log(`${CLI} Reading base tsconfig from ${baseConfigPath}`)
    const baseConfigContent = await readFile(baseConfigPath, 'utf-8')
    const baseConfig = JSON5.parse(baseConfigContent)
    
    console.log(`${CLI} Reading package tsconfig from ${packageConfigPath}`)
    const packageConfigContent = await readFile(packageConfigPath, 'utf-8')
    const packageConfig = JSON5.parse(packageConfigContent)
    
    delete packageConfig.extends
    
    const mergedConfig = {
      ...baseConfig,
      compilerOptions: {
        ...baseConfig.compilerOptions,
        ...(packageConfig.compilerOptions || {})
      },
      ...packageConfig
    }

    if (mergedConfig.compilerOptions) {
      delete mergedConfig.compilerOptions.baseUrl
      delete mergedConfig.compilerOptions.paths
    }

    mergedConfig.include = ['dist']
    
    const mergedConfigPath = join(publishPath, 'tsconfig.json')
    
    await mkdir(dirname(mergedConfigPath), { recursive: true })
    await writeFile(mergedConfigPath, JSON.stringify(mergedConfig, null, 2))
    console.log(`${CLI} Generated merged tsconfig at ${mergedConfigPath}`)
  }
}

class ESBuildBuilder {
  private readonly CLI = '\x1b[34mCLI\x1b[0m'
  private readonly ESM = '\x1b[32mESM\x1b[0m'
  private readonly assets = ['README.md', 'tsconfig.json', 'package.json']
  private readonly sharedConfig: esbuild.BuildOptions = {
    platform: 'node',
    bundle: true,
    target: 'node20',
    packages: 'external',
    minify: false,
    minifyWhitespace: false,
    minifyIdentifiers: true,
    minifySyntax: true,
    sourcemap: false,
    legalComments: 'inline'
  }

  async buildPackage(packageInfo: PackageInfo, workspaceDeps: WorkspaceDependency[]): Promise<void> {
    const { name, path, publishPath } = packageInfo
    const dirName = publishPath.replace('publish/', '')
    console.log(`${this.CLI} Building package: ${name}`)

    const plugins = this.createESBuildPlugins(workspaceDeps)
    const cjsOutfile = `${publishPath}/dist/cjs/index.cjs`
    const esmOutfile = `${publishPath}/dist/mjs/index.js`

    console.log(`${this.CLI} Building CJS for ${name}`)
    await esbuild.build({
      ...this.sharedConfig,
      entryPoints: [`${path}/src/index.ts`],
      outfile: cjsOutfile,
      format: 'cjs',
      plugins
    })
    await this.postProcessBundle(cjsOutfile)
    console.log(`${this.CLI} Built CJS for ${name}`)

    console.log(`${this.ESM} Building ESM for ${name}`)
    await esbuild.build({
      ...this.sharedConfig,
      entryPoints: [`${path}/src/index.ts`],
      outfile: esmOutfile,
      format: 'esm',
      plugins
    })
    await this.postProcessBundle(esmOutfile)
    console.log(`${this.ESM} Built ESM for ${name}`)

    await this.copyAssets(path, dirName)

    await writeFile(`${publishPath}/dist/cjs/package.json`, JSON.stringify({ type: 'commonjs' }, null, 2))
    await writeFile(`${publishPath}/dist/mjs/package.json`, JSON.stringify({ type: 'module' }, null, 2))

    console.log(`${this.CLI} Finished packaging ${name}`)
  }

  private createESBuildPlugins(workspaceDeps: WorkspaceDependency[]): esbuild.Plugin[] {
    const workspaceMap = new Map(workspaceDeps.map(dep => [dep.name, dep]))

    return [
      {
        name: 'workspace-resolver',
        setup(build) {
          build.onResolve({ filter: /^@asterflow\// }, (args) => {
            if (workspaceMap.has(args.path)) {
              return { external: true }
            }
            return null
          })
        }
      },
      {
        name: 'add-source-comments',
        setup(build) {
          build.onLoad({ filter: /\.tsx?$/ }, async (args) => {
            const contents = await readFile(args.path, 'utf8')
            const relativePath = relative(process.cwd(), args.path).replace(/\\/g, '/')
            const newContents = `// ${relativePath}\n${contents}`
            return { contents: newContents, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' }
          })
        }
      }
    ]
  }
  
  private async postProcessBundle(filePath: string): Promise<void> {
    if (!existsSync(filePath)) return

    let content = await readFile(filePath, 'utf-8')

    // Regex para encontrar:
    // Comentários de bloco (`/* ... */`)
    // Comentários de linha (`// ...`), que são capturados em um grupo
    const commentRegex = /\/\*[\s\S]*?\*\/|(\/\/[^\r\n]*)/g

    content = content.replace(commentRegex, (match, singleLineComment) => {
      // Se `singleLineComment` foi capturado, significa que a regex encontrou um `//`
      if (singleLineComment) {
        // Verificamos se é um comentário de caminho que queremos preservar
        if (singleLineComment.startsWith('// core/') || singleLineComment.startsWith('// packages/')) {
          return singleLineComment // Mantém o comentário
        }
      }
      // Para todos os outros casos (comentários de bloco ou de linha que não queremos),
      // retorna uma string vazia, efetivamente removendo-os.
      return ''
    })

    // Remove linhas em branco extras que podem ter sido deixadas para trás
    content = content.replace(/^\s*[\r\n]/gm, '')

    await writeFile(filePath, content, 'utf-8')
  }

  private async copyAssets(sourcePath: string, targetDir: string): Promise<void> {
    for (const asset of this.assets.filter(a => a !== 'tsconfig.json')) {
      const sourceFull = join(sourcePath, asset)
      if (existsSync(sourceFull)) {
        console.log(`${this.CLI} Copying asset: ${asset}`)
        await cp(sourceFull, `publish/${targetDir}/${asset}`)
      }
    }
  }
}

class DependencyManager {
  private readonly CLI = '\x1b[34mCLI\x1b[0m'
  
  constructor(private registry: PackageRegistry) {}

  async replaceWorkspaceDependencies(packageInfo: PackageInfo): Promise<void> {
    const { publishPath, name } = packageInfo
    console.log(`${this.CLI} Replacing workspace dependencies in ${name}`)
    
    const manifestPath = join(publishPath, 'package.json')
    const content = await readFile(manifestPath, 'utf-8')
    const pkg = JSON.parse(content)

    let hasChanges = false

    for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
      const deps = pkg[field] as Record<string, string>
      if (!deps) continue

      for (const [depName, depVersion] of Object.entries(deps)) {
        if (typeof depVersion === 'string' && depVersion.startsWith('workspace:')) {
          console.log(`${this.CLI} Found workspace dependency ${depName}: ${depVersion}`)
          
          const targetPackage = this.registry.getPackageByName(depName)
          if (targetPackage) {
            console.log(`${this.CLI} Replacing ${depName}@${depVersion} with ${targetPackage.version}`)
            deps[depName] = targetPackage.version
            hasChanges = true
          } else {
            console.warn(`⚠️  Cannot resolve workspace dependency: ${depName}`)
          }
        }
      }
    }

    if (hasChanges) {
      await writeFile(manifestPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
      console.log(`${this.CLI} Updated workspace dependencies in ${name}`)
    } else {
      console.log(`${this.CLI} No workspace dependencies to update in ${name}`)
    }
  }
}

class Builder {
  private readonly CLI = '\x1b[34mCLI\x1b[0m'
  private registry = new PackageRegistry()
  private tsBuilder = new TypeScriptBuilder()
  private esBuildBuilder = new ESBuildBuilder()
  private dependencyManager = new DependencyManager(this.registry)

  private async cleanPublishDirectory(): Promise<void> {
    console.log(`${this.CLI} Cleaning up old publish directory...`)
    if (existsSync('publish')) await rm('publish', { recursive: true })
    console.log(`${this.CLI} Cleaned publish directory`)
  }

  public async build(): Promise<void> {
    console.log(`${this.CLI} 🚀 Starting modular build process...`)
    
    await this.cleanPublishDirectory()
    await this.registry.discoverPackages()
    await this.tsBuilder.generateTypes()
    
    const packages = this.registry.getAllPackages()
    
    for (const packageInfo of packages) {
      console.log(`\n${this.CLI} ═══ Building ${packageInfo.name} ═══`)
       
      await this.tsBuilder.mergeTsConfig(packageInfo)
       
      const workspaceDeps = await this.registry.resolveWorkspaceDependencies(packageInfo.path)
      console.log(`${this.CLI} Workspace dependencies for ${packageInfo.name}:`, 
        workspaceDeps.map(dep => `${dep.name}@${dep.targetVersion}`))
       
      await this.esBuildBuilder.buildPackage(packageInfo, workspaceDeps)
    }
    
    await this.tsBuilder.copyTypesToPublish()
    
    console.log(`\n${this.CLI} ═══ Updating workspace dependencies ═══`)
    for (const packageInfo of packages) {
      await this.dependencyManager.replaceWorkspaceDependencies(packageInfo)
    }
    
    console.log(`\n${this.CLI} ✅ All packages built and ready for publish!`)
    console.log(`${this.CLI} Built packages:`)
    packages.forEach(pkg => {
      console.log(`${this.CLI}   • ${pkg.name}@${pkg.version}`)
    })
  }
}

// Execute build
const builder = new Builder()
builder.build().catch(console.error)