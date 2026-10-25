import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AdminUser, ServerEvent } from "../../../../../shared/api";
import { DEV_EDITOR } from "../../env";
import { isStaff, useAccount } from "../../state/account";
import { useDismiss, useMenuKeys } from "../lib/hooks";
import { Icon } from "../kit/icons";
import { phaseOf } from "../lib/event-status";
import { Link, type Route } from "../lib/router";

export interface SiteLink {
  to: string;
  label: string;
  active: boolean;
  /** Число в кружке над пунктом (идущие мероприятия, неподтверждённые пользователи); 0 — не показывать. */
  count?: number;
}

/** Счётчики пунктов меню: идущие мероприятия и (для персонала) неподтверждённые пользователи. Обновляются при смене страницы и раз в минуту. */
function useNavCounts(route: Route, signedIn: boolean, staff: boolean) {
  const [counts, setCounts] = useState({ events: 0, pending: 0 });
  const page = route.page;
  useEffect(() => {
    if (!signedIn) return setCounts({ events: 0, pending: 0 });
    let alive = true;
    const load = async () => {
      const { api } = await import("../../state/api");
      const [events, pending] = await Promise.all([
        api<ServerEvent[]>("GET", "/events").then((l) => l.filter((e) => phaseOf(e, Date.now()) === "open").length, () => 0),
        staff ? api<AdminUser[]>("GET", "/admin/users?status=pending").then((l) => l.length, () => 0) : 0,
      ]);
      if (alive) setCounts({ events, pending });
    };
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [signedIn, staff, page]);
  return counts;
}

/** Разделы сайта, доступные этому пользователю: одни и те же на широком экране и в меню телефона. */
export function useSiteLinks(route: Route): SiteLink[] {
  const server = useAccount((s) => s.server);
  const me = useAccount((s) => s.me);
  const staff = server === "online" && isStaff(me);
  const counts = useNavCounts(route, server === "online" && !!me, staff);
  return [
    { to: "/cases", label: "Дела", active: route.page === "cases" },
    ...(server === "online" && me ? [{ to: "/events", label: "Мероприятия", active: route.page === "events" || (route.page === "admin" && route.section === "events"), count: counts.events }] : []),
    { to: "/results", label: "Результаты", active: route.page === "results" },
    ...(staff ? [{ to: "/admin/users", label: "Пользователи", active: route.page === "admin" && route.section === "users", count: counts.pending }] : []),
    // с сервером конструктор — в меню пользователя; здесь он только у локальной разработки
    ...(server === "none" && DEV_EDITOR ? [{ to: "/editor", label: "Конструктор дел", active: route.page === "editor" }] : []),
  ];
}

/** Маленький кружок со счётчиком у пункта меню. */
export function NavCount({ n }: { n?: number }) {
  return n ? (
    <span className="nav-count" aria-label={`: ${n}`}>
      {n > 99 ? "99+" : n}
    </span>
  ) : null;
}

/** Пункты разделов как пункты меню (внутри popup). */
export function SiteLinkItems({ links, onPick }: { links: SiteLink[]; onPick?: () => void }) {
  return (
    <>
      {links.map((l) => (
        <Link key={l.to} to={l.to} role="menuitem" aria-current={l.active ? "page" : undefined} onClick={onPick}>
          {l.label}
          <NavCount n={l.count} />
        </Link>
      ))}
    </>
  );
}

/**
 * «Меню» на телефоне для гостя и офлайн-версии: разделы сайта и, если передан, пункт входа.
 * На широком экране шапка показывает разделы строкой (см. `.site-nav`), меню скрыто.
 */
export function PhoneMenu({ route, children }: { route: Route; children?: ReactNode }) {
  const links = useSiteLinks(route);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), [ref]);
  useMenuKeys(open, ref);
  return (
    <div className="user-menu phone-menu" ref={ref}>
      <button className="user-menu__button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="menu" size={20} />
        <span className="phone-menu__label">Меню</span>
      </button>
      {open && (
        <div className="user-menu__popup" role="menu">
          <SiteLinkItems links={links} onPick={() => setOpen(false)} />
          {children && <hr />}
          {children}
        </div>
      )}
    </div>
  );
}
