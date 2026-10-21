import { Hono } from "hono";
import { SettingsBody, type Settings } from "../../../../../shared/api";
import {
  getSetting,
  parseBody,
  putSetting,
  requireAdmin,
  requireStaff,
  type AppEnv,
} from "../../http";

import { audit } from "./access";

export const settingsRoutes = new Hono<AppEnv>()
  .get("/settings", async (c) => {
    requireStaff(c);
    return c.json({
      registrationOpen: await getSetting(c.var.db, "registrationOpen", true),
    } satisfies Settings);
  })

  .put("/settings", async (c) => {
    const admin = requireAdmin(c);
    const body = await parseBody(c, SettingsBody);
    await putSetting(c.var.db, "registrationOpen", body.registrationOpen);
    await audit(c.var.db, admin.id, "settings.update", body);
    return c.json(body satisfies Settings);
  });
