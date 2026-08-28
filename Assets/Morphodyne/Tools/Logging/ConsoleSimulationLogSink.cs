using System;
using Morphodyne.Simulation.Logging;

namespace Morphodyne.Tools.Logging
{
    public sealed class ConsoleSimulationLogSink : ISimulationLogSink
    {
        public void Write(SimulationLogEntry entry)
        {
            if (entry == null)
            {
                throw new ArgumentNullException(nameof(entry));
            }

            Console.WriteLine(
                "level={0} component={1} event={2} simulation_tick={3} message=\"{4}\"",
                entry.Level,
                entry.Component,
                entry.EventName,
                entry.SimulationTick,
                entry.Message.Replace("\"", "\\\""));
        }
    }
}
