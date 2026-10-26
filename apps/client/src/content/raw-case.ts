/* eslint-disable @typescript-eslint/no-explicit-any -- единственное место: сырые данные дела старого формата, у которых нет типа */
/** Дело старого формата без типов: тесты миграций правят его так, как было в файле. */
export type Raw = any;

export const rawCase = (c: unknown): Raw => structuredClone(c);
