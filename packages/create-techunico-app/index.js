#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const projectName = process.argv[2]

if (!projectName) {
  console.log('❌ Please provide project name')
  process.exit(1)
}

const targetPath = path.join(process.cwd(), projectName)
const templatePath = path.join(__dirname, 'template')

if (fs.existsSync(targetPath)) {
  console.log('❌ Folder already exists')
  process.exit(1)
}

// copy template
fs.cpSync(templatePath, targetPath, { recursive: true })

console.log(`\n✅ Project ${projectName} created`)
console.log(`\nNext steps:`)
console.log(`cd ${projectName}`)
console.log(`npm install`)
console.log(`npm run dev`)