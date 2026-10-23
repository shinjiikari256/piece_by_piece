import { useRef, useState, type ReactNode } from "react";
import { DEV_EDITOR } from "../../env";
import { isStaff, useAccount } from "../../state/account";
import { useDismiss, useMenuKeys } from "../lib/hooks";
import { Icon } from "../kit/icons";
import { Link, type Route } from "../lib/router";

export interface SiteLink {
  to: string;
  label: string;
  active: boolean;
}

/** Разделы сайта, доступные этому пользователю: одни и те же на широком экране и в меню телефона. */
export function useSiteLinks(route: Route): SiteLink[] {
  const server = useAccount((s) => s.server);
  const me = useAccount((s) => s.me);
  const staff = server === "online" && isStaff(me);
  return [
    { to: "/cases", label: "Дела", active: route.page === "cases" },
    { to: "/results", label: "Результаты", active: route.page === "results" },
    ...(staff ? [{ to: "/admin/users", label: "Пользователи", active: route.page === "admin" && route.section === "users" }] : []),
    ...(staff || (server === "none" && DEV_EDITOR) ? [{ to: "/editor", label: "Конструктор дел", active: route.page === "editor" }] : []),
  ];
}

/** Пункты разделов как пункты меню (внутри popup). */
export function SiteLinkItems({ links, onPick }: { links: SiteLink[]; onPick?: () => void }) {
  return (
    <>
      {links.map((l) => (
        <Link key={l.to} to={l.to} role="menuitem" aria-current={l.active ? "page" : undefined} onClick={onPick}>
          {l.label}
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
