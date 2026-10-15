import { ParseUUIDPipe } from '@nestjs/common';

/** Id que não é UUID é 404 antes de ir ao banco. */
export const UUID = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
