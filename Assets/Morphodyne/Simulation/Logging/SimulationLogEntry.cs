using System;

namespace Morphodyne.Simulation.Logging
{
    public sealed class SimulationLogEntry
    {
        public SimulationLogEntry(
            SimulationLogLevel level,
            string component,
            string eventName,
            long simulationTick,
            string message)
        {
            if (string.IsNullOrWhiteSpace(component))
            {
                throw new ArgumentException("Component cannot be blank.", nameof(component));
            }

            if (string.IsNullOrWhiteSpace(eventName))
            {
                throw new ArgumentException("Event name cannot be blank.", nameof(eventName));
            }

            if (simulationTick < 0)
            {
                throw new ArgumentOutOfRangeException(nameof(simulationTick), "Simulation tick cannot be negative.");
            }

            Level = level;
            Component = component;
            EventName = eventName;
            SimulationTick = simulationTick;
            Message = message ?? throw new ArgumentNullException(nameof(message));
        }

        public SimulationLogLevel Level { get; }

        public string Component { get; }

        public string EventName { get; }

        public long SimulationTick { get; }

        public string Message { get; }
    }
}
