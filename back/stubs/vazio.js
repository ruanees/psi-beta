// O Nest carrega microservices e websockets por require dinâmico, que o esbuild
// não resolve. O PSI não usa nenhum dos dois: o alias do wrangler.toml aponta
// para cá e o bundle fecha. Sem isto ele nem gera (lição do DIME).
module.exports = {};
