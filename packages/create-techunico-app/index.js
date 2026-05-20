#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const args = process.argv.slice(2)

if (!args.length || !args[0].trim()) {
  console.error('❌ Please provide project name')
  process.exit(1)
}

const projectName = args[0]
const targetPath = path.join(process.cwd(), projectName)
const templatePath = path.join(__dirname, 'template')

if (!fs.existsSync(templatePath)) {
  console.error('❌ Template missing')
  process.exit(1)
}

if (fs.existsSync(targetPath)) {
  console.error('❌ Folder already exists')
  process.exit(1)
}

fs.mkdirSync(targetPath, { recursive: true })

fs.cpSync(templatePath, targetPath, {
  recursive: true,
  force: true
})

// 🔧 Update package.json name
const pkgPath = path.join(targetPath, 'package.json')
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  pkg.name = projectName
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
}

console.log(`\n✅ Project ${projectName} created`)

// 📦 Install deps
console.log('\n📦 Installing dependencies...')
execSync('npm install', {
  cwd: targetPath,
  stdio: 'inherit'
})

// 🚀 Next steps
console.log(`
🚀 Next steps:

cd ${projectName}

npx prisma generate

npm run dev
`)