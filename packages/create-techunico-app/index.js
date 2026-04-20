#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)

if (args.length === 0 || !args[0].trim()) {
  console.error('❌ Please provide project name')
  process.exit(1)
}

const projectName = args[0]

const targetPath = path.join(process.cwd(), projectName)
const templatePath = path.join(__dirname, 'template')

console.log('👉 __dirname:', __dirname)
console.log('👉 templatePath:', templatePath)
console.log('👉 targetPath:', targetPath)

if (!fs.existsSync(templatePath)) {
  console.error('❌ Template missing')
  process.exit(1)
}

const files = fs.readdirSync(templatePath)
console.log('📂 Template files:', files)

if (files.length === 0) {
  console.error('❌ Template empty')
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

console.log(`\n✅ Project ${projectName} created`)