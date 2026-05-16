# FlowHub Firebase Backups

Run a manual backup:

```bash
npm run backup
```

That writes a dated JSON file to `backups/`, including:

- `flowhub/appdata`
- `flowhub/canvas`
- `flowhub/tasknotes`

Schedule a daily local backup with cron:

```bash
crontab -e
```

Add this line to run every day at 2:00 AM:

```cron
0 2 * * * cd /home/gsr/my_project_ws/flowhub && /home/gsr/.nvm/versions/node/v20.20.2/bin/npm run backup >> backups/backup.log 2>&1
```

Keep the computer on at that time. For a cloud-grade backup that runs even when your machine is off, use a server, GitHub Actions, or Firebase Cloud Scheduler.
