// Re-export from primary telegramBot service to avoid duplicate polling instances
export { sendAlert, sendUrgentAlert } from './telegramBot';
