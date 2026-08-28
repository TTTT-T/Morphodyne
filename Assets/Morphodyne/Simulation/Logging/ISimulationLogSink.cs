namespace Morphodyne.Simulation.Logging
{
    public interface ISimulationLogSink
    {
        void Write(SimulationLogEntry entry);
    }
}
