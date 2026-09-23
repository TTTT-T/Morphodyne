export interface LogEntry {
  readonly level: 'info' | 'warn' | 'error';
  readonly source: string;
  readonly message: string;
}

export interface LogSink {
  write(entry: LogEntry): void;
}

export const consoleLogSink: LogSink = {
  write(entry) {
    const line = `[${entry.source}] ${entry.message}`;
    if (entry.level === 'error') console.error(line);
    else if (entry.level === 'warn') console.warn(line);
    else console.info(line);
  },
};
