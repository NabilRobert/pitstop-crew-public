// Runs vue-tsc with the frontend's own TypeScript (6.x). With npm workspaces, vue-tsc
// is hoisted to the repo root, where `typescript` is the backend's 7.x; vue-tsc would
// pick that up and fail. Resolving from this package keeps the two apart.
const path = require('node:path')
const tsc = require.resolve('typescript/lib/tsc', { paths: [path.join(__dirname, '..')] })
require('vue-tsc').run(tsc)
