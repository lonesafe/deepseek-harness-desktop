/** Build the pinned macOS helper and private kit entry without modifying installed dependencies. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = dirname(fileURLToPath(import.meta.url))
const require = createRequire(new URL('../package.json', import.meta.url))
const pins = JSON.parse(await readFile(join(root, 'sources.json'), 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const executableName = 'libreoffice-kit-macos'

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.signal !== null || result.status !== 0) {
    throw new Error(`Office native build: ${command} exited ${String(result.status)}, signal ${String(result.signal)}`)
  }
}

async function checked(path, expected) {
  const bytes = await readFile(path)
  if (hash(bytes) !== expected) throw new Error(`Office native build: source checksum mismatch: ${path}`)
  return bytes
}

async function sourceDigest() {
  const paths = ['build.mjs', 'macos-wakeup.mm', 'sources.json', ...Object.keys(pins.headers)].sort()
  const hashes = await Promise.all(paths.map(async path => [path, hash(await readFile(join(root, path)))]))
  return hash(JSON.stringify(hashes))
}

function replaceOnce(source, from, to) {
  if (source.split(from).length !== 2) throw new Error(`Office native build: kit entry anchor changed: ${from}`)
  return source.replace(from, to)
}

async function kitEntry() {
  const packagePath = require.resolve('@deepseek-ai/libreoffice-kit/package.json')
  const kitRoot = dirname(packagePath)
  const manifest = JSON.parse(await readFile(packagePath, 'utf8'))
  if (manifest.version !== pins.kitVersion) throw new Error('Office native build: kit version changed')
  let source = (await checked(join(kitRoot, 'lib/index.js'), pins.entrySha256)).toString()
  source = replaceOnce(source, 'import "fontkit";\nimport "fflate";\nimport "saxes";',
    'import "@deepseek-ai/libreoffice-kit";\nimport { fileURLToPath, pathToFileURL } from "node:url";\n'
    + 'const kitPackageUrl = pathToFileURL(createRequire(import.meta.url).resolve("@deepseek-ai/libreoffice-kit/package.json"));\n'
    + 'function physicalNativePath(path) { return path.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`); }')
  source = replaceOnce(source, 'const require = createRequire(import.meta.url);',
    'const require = createRequire(kitPackageUrl);')
  source = replaceOnce(source, 'new Worker(new URL("./worker.js", import.meta.url), {',
    'new Worker(new URL("./lib/worker.js", kitPackageUrl), {')
  source = replaceOnce(source, 'const child = spawn(engine.executable, [',
    'const executable = process.platform === "darwin" ? fileURLToPath(new URL("./libreoffice-kit-macos", import.meta.url)) : engine.executable;\n'
    + '\tconst child = spawn(physicalNativePath(executable), [')
  source = replaceOnce(source, 'return path;\n}\nfunction glibcVersion',
    'return physicalNativePath(path);\n}\nfunction glibcVersion')
  const notice = Buffer.concat([
    Buffer.from('Harness compatibility materials: native/build.mjs, native/macos-wakeup.mm, native/sources.json, and native/include/.\n'
      + 'The generated entry changes helper selection and ASAR filesystem paths; validators, font work, and engine selection retain the pinned kit implementation.\n'
      + 'The helper links the pinned engine package sources/engine/native/worker.cxx with the Harness compatibility source.\n\n'),
    await readFile(join(kitRoot, 'NOTICE')),
  ])
  return { source, notice }
}

function verifyUniversal(bytes) {
  if (bytes.length < 48 || bytes.readUInt32BE(0) !== 0xcafebabe || bytes.readUInt32BE(4) !== 2) {
    throw new Error('Office native build: helper must be a two-architecture Mach-O universal executable')
  }
  const cpus = [bytes.readUInt32BE(8), bytes.readUInt32BE(28)].sort((a, b) => a - b)
  if (cpus[0] !== 0x01000007 || cpus[1] !== 0x0100000c) {
    throw new Error('Office native build: helper must contain x86_64 and arm64')
  }
}

async function verify(output) {
  const record = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'))
  if (record.schemaVersion !== 1 || record.kitVersion !== pins.kitVersion
    || record.coreRevision !== pins.coreRevision || record.sourceDigest !== await sourceDigest()
    || JSON.stringify(record.architectures) !== JSON.stringify(['arm64', 'x64'])) {
    throw new Error('Office native build: generated manifest does not match the pinned sources')
  }
  for (const name of ['entry.js', executableName, 'NOTICE']) await checked(join(output, name), record.files[name])
  const executable = join(output, executableName)
  if (!((await stat(executable)).mode & 0o111)) throw new Error('Office native build: helper has no executable permission')
  verifyUniversal(await readFile(executable))
  const entry = await kitEntry()
  if ((await readFile(join(output, 'entry.js'), 'utf8')) !== entry.source) {
    throw new Error('Office native build: generated adapter does not match the installed kit')
  }
  console.log(`Office native build: verified ${output}`)
}

async function build(output) {
  for (const [path, expected] of Object.entries(pins.headers)) await checked(join(root, path), expected)
  const entry = await kitEntry()
  if (process.platform !== 'darwin') {
    // Linux release packing retains the macOS artifact downloaded before its build.
    await mkdir(output, { recursive: true })
    await writeFile(join(output, 'entry.js'), entry.source)
    await writeFile(join(output, 'NOTICE'), entry.notice)
    console.log(`Office native build: generated adapter for ${process.platform}; macOS helper is supplied by the release artifact`)
    return
  }
  const kitRequire = createRequire(require.resolve('@deepseek-ai/libreoffice-kit/package.json'))
  const engineRoot = dirname(kitRequire.resolve(`@deepseek-ai/libreoffice-kit-darwin-${process.arch}/package.json`))
  const core = JSON.parse(await readFile(join(engineRoot, 'sources/core-source.json'), 'utf8'))
  if (core.revision !== pins.coreRevision) throw new Error('Office native build: LibreOffice Core revision changed')
  const worker = join(engineRoot, 'sources/engine/native/worker.cxx')
  await checked(worker, pins.workerSha256)
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-office-native-'))
  try {
    for (const arch of ['arm64', 'x86_64']) {
      run('c++', ['-std=c++17', '-O2', '-arch', arch, '-mmacosx-version-min=11.0',
        `-ffile-prefix-map=${engineRoot}=libreoffice-kit`, `-ffile-prefix-map=${root}=dsh-office-native`,
        '-I', join(root, 'include'), worker, join(root, 'macos-wakeup.mm'),
        '-framework', 'CoreFoundation', '-framework', 'CoreText', '-framework', 'AppKit',
        '-o', join(temporary, arch)])
    }
    run('lipo', ['-create', join(temporary, 'arm64'), join(temporary, 'x86_64'), '-output', join(temporary, executableName)])
    await writeFile(join(temporary, 'entry.js'), entry.source)
    await writeFile(join(temporary, 'NOTICE'), entry.notice)
    const files = {}
    for (const name of ['entry.js', executableName, 'NOTICE']) files[name] = hash(await readFile(join(temporary, name)))
    await writeFile(join(temporary, 'manifest.json'), JSON.stringify({
      schemaVersion: 1, kitVersion: pins.kitVersion, coreRevision: pins.coreRevision,
      sourceDigest: await sourceDigest(), architectures: ['arm64', 'x64'], files,
    }, null, 2) + '\n')
    await mkdir(output, { recursive: true })
    for (const name of [...Object.keys(files), 'manifest.json']) {
      const pending = join(output, `${name}.pending-${process.pid}`)
      await copyFile(join(temporary, name), pending)
      if (name === executableName) await chmod(pending, 0o755)
      await rename(pending, join(output, name))
    }
    await verify(output)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

const { values } = parseArgs({ options: { output: { type: 'string' }, verify: { type: 'boolean' } } })
const output = resolve(values.output ?? join(root, '../lib/native'))
await (values.verify ? verify(output) : build(output))
