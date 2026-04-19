import { sendWelcomeEmailListener } from './listeners/user/send-welcome-email.listener';
import { EventService } from './event.service';

export function registerEventListeners(eventService:EventService) {
  eventService.register(sendWelcomeEmailListener);
}