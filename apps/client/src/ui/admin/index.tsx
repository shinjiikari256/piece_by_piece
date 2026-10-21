import { useCallback, useEffect, useState } from "react";
import {
  STATUS_LABEL,
  type AdminGroup,
  type UserStatus,
} from "../../../../../shared/api";
import { ApiFailure, api, isStaff, useAccount } from "../../state/account";
import { tell } from "../dialog";
import { formatDate } from "../../util/format";
import { STATUS_TONE } from "../tone";
import { type Route } from "../router";
import { UsersSection } from "./users";
import { UserPage } from "./user-page";
import { GroupsSection } from "./groups";
import { EventsSection } from "./events";
import { SettingsSection } from "./settings";
/** Раздел «Пользователи»: пользователи, карточка пользователя, группы и ссылки, настройки. */

type AdminRoute = Extract<Route, { page: "admin" }>;

export const fail = (e: unknown) =>
  void tell({ title: "Не получилось", text: e instanceof ApiFailure ? e.message : "Ошибка связи с сервером" });

export const date = (iso: string | null) => (iso ? formatDate(iso) : "—");

export const StatusChip = ({ status }: { status: UserStatus }) => <span className="status" data-tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</span>;

export function AdminPage({ route }: { route: AdminRoute }) {
  const server = useAccount((s) => s.server);
  const me = useAccount((s) => s.me);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const staff = server === "online" && isStaff(me);
  const loadGroups = useCallback(() => api<AdminGroup[]>("GET", "/admin/groups").then(setGroups, fail), []);
  useEffect(() => {
    if (staff) void loadGroups();
  }, [staff, loadGroups]);

  if (server === "unknown") return null;
  if (!staff)
    return (
      <div className="page page--narrow">
        <h1>Пользователи</h1>
        <p className="muted">
          {server === "none" ? "Раздел работает только с сервером: запустите `pnpm server:dev` (и базу — `pnpm db:up`)." : "Раздел доступен преподавателям и администратору."}
        </p>
      </div>
    );
  const isAdmin = me!.role === "admin";
  return (
    <div className="page page--wide">
      {route.section === "users" && route.userId && <UserPage id={route.userId} groups={groups} isAdmin={isAdmin} />}
      {route.section === "users" && !route.userId && <UsersSection groups={groups} isAdmin={isAdmin} onChanged={loadGroups} />}
      {route.section === "groups" && <GroupsSection groups={groups} isAdmin={isAdmin} reload={loadGroups} />}
      {route.section === "events" && <EventsSection groups={groups} />}
      {route.section === "settings" && (isAdmin ? <SettingsSection /> : <p className="muted">Настройки доступны только администратору.</p>)}
    </div>
  );
}
