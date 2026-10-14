import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// O adaptador chama `npm run build` para compilar o Next — e `npm run build`
// chama o adaptador. Sem o buildCommand abaixo é recursão infinita, e o sintoma
// é um build que nunca termina, sem erro nenhum (lição do DIME).
export default {
  ...defineCloudflareConfig({}),
  buildCommand: 'npx next build',
};
