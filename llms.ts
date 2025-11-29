import { existsSync } from 'fs';
import { readFile, writeFile, rm } from 'fs/promises';
import { glob } from 'glob';

interface PackageInfo {
    name: string;
    path: string;
}

class PackageRegistry {
    private packages = new Map<string, PackageInfo>();

    async discoverPackages(): Promise<void> {
        const packagePaths = await glob(['packages/*/', 'core']);

        for (const packagePath of packagePaths) {
            const pkgJsonPath = `${packagePath}/package.json`;
            if (!existsSync(pkgJsonPath)) continue;

            const content = await readFile(pkgJsonPath, 'utf-8');
            const pkg = JSON.parse(content);

            this.packages.set(pkg.name, {
                name: pkg.name,
                path: packagePath,
            });

            console.log(`📦 Discovered ${pkg.name} at ${packagePath}`);
        }
    }

    getAllPackages(): PackageInfo[] {
        return Array.from(this.packages.values());
    }
}

class LLMSBuilder {
    async buildProject(packageInfo: PackageInfo): Promise<void> {
        const { name, path } = packageInfo;
        console.log(`🔨 Building llms.ts for ${name}`);

        const sourceFiles = await glob(`${path}/src/**/*.ts`, {
            ignore: [
                '**/*.test.ts',
                '**/*.spec.ts',
                '**/tests/**',
                '**/test/**',
                '**/__tests__/**',
                '**/__test__/**',
                '**/node_modules/**',
                '**/dist/**',
                '**/build/**',
                '**/coverage/**',
                '**/.git/**'
            ],
        });

        let combinedContent = `// Combined source for ${name}\n\n`;

        for (const filePath of sourceFiles) {
            // Ignorar arquivos de configuração específicos
            const ignoredFiles = [
                'tsconfig.json',
                'biome.json',
                'llms.txt',
                'package.json',
                'package-lock.json',
                'yarn.lock',
                '.gitignore',
                '.eslintrc.js',
                '.prettierrc.js'
            ];

            const fileName = filePath.split('/').pop();
            if (fileName && ignoredFiles.includes(fileName)) {
                continue;
            }

            try {
                const fileContent = await readFile(filePath, 'utf-8');
                combinedContent += `// --- From: ${filePath} ---
`;
                combinedContent += `${fileContent}\n\n`;
            } catch (error) {
                console.warn(`⚠️  Could not read file ${filePath}: ${error}`);
            }
        }

        const outputPath = `${path}/llms.txt`;
        if (existsSync(outputPath)) {
            await rm(outputPath);
        }
        await writeFile(outputPath, combinedContent);
        console.log(`✅ llms.txt created for ${name} at ${outputPath}`);
    }
}

class Builder {
    private registry = new PackageRegistry();
    private llmsBuilder = new LLMSBuilder();

    public async build(): Promise<void> {
        console.log('🚀 Starting llms-build process...\n');

        await this.registry.discoverPackages();
        const packages = this.registry.getAllPackages();

        for (const packageInfo of packages) {
            console.log(`\n═══ Processing ${packageInfo.name} ═══`);
            await this.llmsBuilder.buildProject(packageInfo);
        }

        console.log('\n✅ llms-build completed!');
        console.log('📦 llms.txt files generated for:');
        packages.forEach(pkg => {
            console.log(`   • ${pkg.name}`);
        });
    }
}

// Execute build
const builder = new Builder();
builder.build().catch(console.error);