import { $ } from 'bun'
import { exec } from 'child_process'
import { existsSync } from 'fs'
import { cp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { glob } from 'glob'

import { promisify } from 'util'

const execAsync = promisify(exec)


interface PackageInfo {
	name: string
	version: string
	path: string
	publishPath: string
}

class PackageRegistry {
	private packages = new Map<string, PackageInfo>()

	async discoverPackages(): Promise<void> {
		const packagePaths = await glob(['packages/*/', 'core'])

		for (const packagePath of packagePaths) {
			const pkgJsonPath = `${packagePath}/package.json`
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

			console.log(`📦 ${pkg.name}@${pkg.version} -> ${publishPath}`)
		}
	}

	getPackageByName(name: string): PackageInfo | undefined {
		return this.packages.get(name)
	}

	getAllPackages(): PackageInfo[] {
		return Array.from(this.packages.values())
	}
}

class TypeScriptBuilder {
	async generateTypes(): Promise<void> {
		console.log('📝 Generating TypeScript declarations...')

		if (existsSync('core/dist')) {
			await rm('core/dist', { recursive: true })
		}

		await execAsync(`bunx tsc -p core/tsconfig.build.json --noEmit false`)
		console.log('✅ TypeScript declarations generated')
	}

	async copyTypesToPublish(): Promise<void> {
		console.log('📝 Copying type definitions...')

		// Copiar tipos do core
		if (existsSync('core/dist/types')) {
			await mkdir('publish/core/dist/types', { recursive: true })
			await cp('core/dist/types', 'publish/core/dist/types', { recursive: true })
		}

		// Copiar tipos dos packages
		const packages = await glob('core/dist/types/packages/*')
		for (const packagePath of packages) {
			const packageName = packagePath.split('/').pop()
			if (!packageName) continue

			const targetPath = `publish/${packageName}/dist/types`
			await mkdir(targetPath, { recursive: true })

			if (existsSync(packagePath)) {
				await cp(packagePath + '/src', targetPath, { recursive: true })
			}
		}
		await rm('core/dist', { recursive: true })

		console.log('✅ Type definitions copied')
	}
}

class BundleBuilder {
	async buildPackage(packageInfo: PackageInfo): Promise<void> {
		const { name, path, publishPath } = packageInfo

		console.log(`🔨 Building ${name}`)

		// Criar diretórios de saída
		await mkdir(`${publishPath}/dist/cjs`, { recursive: true })
		await mkdir(`${publishPath}/dist/mjs`, { recursive: true })

		// Build CJS
		console.log(`📦 Building CJS for ${name}`)
		await execAsync(`bun build ${path}/src/index.ts \
      --outdir ${publishPath}/dist/cjs \
      --format cjs \
      --target node \
      --packages external \
      --minify`)

		// Build ESM
		console.log(`📦 Building ESM for ${name}`)
		await $`bun build ${path}/src/index.ts \
      --outdir ${publishPath}/dist/mjs \
      --format esm \
      --target node \
      --packages external \
      --minify`

		// Criar package.json files para módulos
		await writeFile(`${publishPath}/dist/cjs/package.json`, JSON.stringify({ type: "commonjs" }))
		await writeFile(`${publishPath}/dist/mjs/package.json`, JSON.stringify({ type: "module" }))

		// Copiar assets
		await this.copyAssets(path, publishPath)

		console.log(`✅ Finished ${name}`)
	}

	private async copyAssets(sourcePath: string, publishPath: string): Promise<void> {
		const assets = ['README.md', 'package.json']

		for (const asset of assets) {
			const sourceFile = `${sourcePath}/${asset}`
			if (existsSync(sourceFile)) {
				await cp(sourceFile, `${publishPath}/${asset}`)
			}
		}
	}
}

class DependencyManager {
	constructor(private registry: PackageRegistry) { }

	async replaceWorkspaceDependencies(packageInfo: PackageInfo): Promise<void> {
		const { publishPath, name } = packageInfo
		console.log(`🔗 Updating dependencies in ${name}`)

		const manifestPath = `${publishPath}/package.json`
		const content = await readFile(manifestPath, 'utf-8')
		const pkg = JSON.parse(content)

		let hasChanges = false

		for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
			const deps = pkg[field]
			if (!deps) continue

			for (const [depName, depVersion] of Object.entries(deps)) {
				if (typeof depVersion === 'string' && depVersion.startsWith('workspace:')) {
					const targetPackage = this.registry.getPackageByName(depName)
					if (targetPackage) {
						deps[depName] = targetPackage.version
						hasChanges = true
						console.log(`  ↳ ${depName}: ${depVersion} → ${targetPackage.version}`)
					}
				}
			}
		}

		if (hasChanges) {
			await writeFile(manifestPath, JSON.stringify(pkg, null, 2))
		}
	}
}

class Builder {
	private registry = new PackageRegistry()
	private tsBuilder = new TypeScriptBuilder()
	private bundleBuilder = new BundleBuilder()
	private dependencyManager = new DependencyManager(this.registry)

	private async cleanPublishDirectory(): Promise<void> {
		if (existsSync('publish')) {
			console.log('🧹 Cleaning publish directory...')
			await rm('publish', { recursive: true })
		}
	}

	public async build(): Promise<void> {
		console.log('🚀 Starting build process...\n')

		await this.cleanPublishDirectory()
		await this.registry.discoverPackages()
		await this.tsBuilder.generateTypes()

		const packages = this.registry.getAllPackages()

		// Build todos os packages
		for (const packageInfo of packages) {
			console.log(`\n═══ Building ${packageInfo.name} ═══`)
			await this.bundleBuilder.buildPackage(packageInfo)
		}

		// Copiar tipos após o build
		await this.tsBuilder.copyTypesToPublish()

		// Atualizar dependências
		console.log('\n🔗 Updating workspace dependencies...')
		for (const packageInfo of packages) {
			await this.dependencyManager.replaceWorkspaceDependencies(packageInfo)
		}

		// Resumo final
		console.log('\n✅ Build completed!')
		console.log('📦 Packages built:')
		packages.forEach(pkg => {
			console.log(`   • ${pkg.name}@${pkg.version}`)
		})
	}
}

// Executar build
const builder = new Builder()
builder.build().catch(console.error)