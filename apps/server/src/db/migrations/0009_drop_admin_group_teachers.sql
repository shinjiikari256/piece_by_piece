DELETE FROM "group_teachers" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "role" = 'admin');
