using System;
using Morphodyne.PhysicsAdapter;
using Morphodyne.Simulation.Logging;

namespace Morphodyne.Simulation
{
    public sealed class FixedStepSimulation
    {
        private readonly IPhysicsAdapter _physicsAdapter;
        private readonly ISimulationLogSink? _logSink;
        private readonly double _fixedDeltaSeconds;

        public FixedStepSimulation(
            IPhysicsAdapter physicsAdapter,
            double fixedDeltaSeconds,
            ISimulationLogSink? logSink = null)
        {
            _physicsAdapter = physicsAdapter ?? throw new ArgumentNullException(nameof(physicsAdapter));
            if (double.IsNaN(fixedDeltaSeconds) || double.IsInfinity(fixedDeltaSeconds) || fixedDeltaSeconds <= 0d)
            {
                throw new ArgumentOutOfRangeException(
                    nameof(fixedDeltaSeconds),
                    "Fixed step duration must be finite and greater than zero.");
            }

            _fixedDeltaSeconds = fixedDeltaSeconds;
            _logSink = logSink;
        }

        public long CompletedSteps { get; private set; }

        public void Step()
        {
            var step = new PhysicsStep(CompletedSteps, _fixedDeltaSeconds);
            _physicsAdapter.Step(step);
            CompletedSteps++;
            _logSink?.Write(new SimulationLogEntry(
                SimulationLogLevel.Trace,
                "Simulation",
                "fixed_step_completed",
                step.Index,
                "A fixed simulation step completed."));
        }
    }
}
