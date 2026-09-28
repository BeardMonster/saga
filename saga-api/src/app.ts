import Fastify from "fastify";
import multipart from "@fastify/multipart";
import prismaPlugin from "./plugins/prisma.js";
import healthRoutes from "./modules/health/routes.js";
import projectRoutes from "./modules/projects/routes.js";
import checklistRoutes from "./modules/checklists/routes.js";
import goalRoutes from "./modules/goals/routes.js";
import calendarRoutes from "./modules/calendar/routes.js";
import reminderRoutes from "./modules/reminders/routes.js";
import { startReminderScheduler } from "./modules/reminders/scheduler.js";
import peopleRoutes from "./modules/people/routes.js";
import personNotesRoutes from "./modules/personNotes/routes.js";
import broadcastRoutes from "./modules/broadcasts/routes.js";
import financeRoutes from "./modules/finance/routes.js";
import investmentRoutes from "./modules/investments/routes.js";
import recipeRoutes from "./modules/recipes/routes.js";
import inboxRoutes from "./modules/inbox/routes.js";
import settingsRoutes from "./modules/settings/routes.js";
import trashRoutes from "./modules/trash/routes.js";
import { startTrashScheduler } from "./modules/trash/scheduler.js";
import { failStuckEntries } from "./modules/inbox/service.js";
import groceryRoutes from "./modules/grocery/routes.js";
import { startGroceryWeekScheduler } from "./modules/grocery/scheduler.js";
import alertRoutes from "./modules/alerts/routes.js";
import chatRoutes from "./modules/chat/routes.js";
import statsRoutes from "./modules/stats/routes.js";
import insultRoutes from "./modules/insults/routes.js";
import dailyPickRoutes from "./modules/dailyPick/routes.js";

const server = Fastify({ logger: true });

await server.register(prismaPlugin);
// Recipe voice/video uploads can be sizeable — well above the 1MB default.
await server.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } });
await server.register(healthRoutes);
await server.register(projectRoutes);
await server.register(checklistRoutes);
await server.register(goalRoutes);
await server.register(calendarRoutes);
await server.register(reminderRoutes);
await server.register(peopleRoutes);
await server.register(broadcastRoutes);
await server.register(financeRoutes);
await server.register(investmentRoutes);
await server.register(recipeRoutes);
await server.register(inboxRoutes);
await server.register(settingsRoutes);
await server.register(trashRoutes);
await server.register(groceryRoutes);
await server.register(alertRoutes);
await server.register(chatRoutes);
await server.register(personNotesRoutes);
await server.register(statsRoutes);
await server.register(insultRoutes);
await server.register(dailyPickRoutes);

startReminderScheduler(server);
startTrashScheduler(server);
startGroceryWeekScheduler(server);
void failStuckEntries(server.prisma).then((n) => n > 0 && server.log.info(`Marked ${n} interrupted Brain Dump entr${n === 1 ? "y" : "ies"} as failed`)).catch(() => undefined);

const port = Number(process.env.PORT ?? 3000);

server
  .listen({ port, host: "0.0.0.0" })
  .then((address) => {
    server.log.info(`Saga API listening at ${address}`);
  })
  .catch((error) => {
    server.log.error(error);
    process.exit(1);
  });
