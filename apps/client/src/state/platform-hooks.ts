import { useCallback, useEffect, useState } from "react";
import { useAccount } from "./account";
import { EMPTY_PROFILE, platform, type Profile } from "./platform";

/**
 * Значение из платформы для экрана: до ответа — `initial`, `reload` читает заново (после своей записи).
 * Операции платформы асинхронные, поэтому экраны сайта читают данные только так.
 */
export function usePlatformValue<T>(load: () => Promise<T>, initial: T, deps: readonly unknown[] = []): [T, () => void] {
  const [value, setValue] = useState(initial);
  const [version, setVersion] = useState(0);
  // другой пользователь — другие сохранения и результаты
  const userId = useAccount((a) => a.me?.id ?? null);
  useEffect(() => {
    let live = true;
    void load().then((v) => live && setValue(v));
    return () => void (live = false);
  }, [version, userId, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps -- deps вызывающего подставляются списком; load читается свежим при каждом срабатывании
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  return [value, reload];
}

/** Профиль игрока (ФИО, группа); обновляется при сохранении из любого места. */
export function useProfile(): Profile {
  const [profile, reload] = usePlatformValue(() => platform().profile.read(), EMPTY_PROFILE);
  useEffect(() => platform().profile.subscribe(reload), [reload]);
  return profile;
}
