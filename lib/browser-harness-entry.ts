import {
  runDekaJs,
  runDekaProject,
  setCompilerArtifactPath,
} from '@dekaruntime/web-ide-kit/runtime'

setCompilerArtifactPath('https://wasm.deka.gg/latest/deka-compiler-artifact.json')

const g = globalThis as typeof globalThis & {
  __dekaRunJs?: typeof runDekaJs
  __dekaRunProject?: typeof runDekaProject
}

g.__dekaRunJs = runDekaJs
g.__dekaRunProject = runDekaProject
