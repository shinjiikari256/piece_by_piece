import { Link } from "../ui/router";
import { Suspense, lazy, type ReactNode } from "react";
import { isStaff, useAccount } from "../state/account";
import { DEV_EDITOR, OFFLINE } from "../env";

/** Смена временного пароля — онлайн-часть; в офлайн-файле её нет вовсе. */
const ForcePasswordChange = OFFLINE ? null : lazy(() => import("../ui/online").then((m) => ({ default: m.ForcePasswordChange })));

/**
 * Конструктор — только преподавателю и администратору (учётная запись на сервере).
 * Без сервера он открыт лишь при разработке (`pnpm dev`): защищать там нечего — всё и так в браузере.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const server = useAccount((s) => s.server);
  const me = useAccount((s) => s.me);
  if (server === "unknown") return null;
  if ((server === "online" && isStaff(me)) || (server === "none" && DEV_EDITOR))
    return (
      <>
        {children}
        {ForcePasswordChange && (
          <Suspense fallback={null}>
            <ForcePasswordChange />
          </Suspense>
        )}
      </>
    );
  return (
    <div className="page page--narrow">
      <h1>Конструктор дел</h1>
      <p className="muted">
        {server === "none"
          ? "Конструктор работает вместе с сервером: запустите `pnpm db:up` и `pnpm server:dev`."
          : me
            ? "Конструктор доступен преподавателям и администратору."
            : "Войдите под учётной записью преподавателя."}
      </p>
      {server === "online" && !me && (
        <Link className="btn btn--primary" to="/login">
          Вход
        </Link>
      )}
    </div>
  );
}
