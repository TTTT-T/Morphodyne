using System;
using System.Collections.Generic;
using Morphodyne.PhysicsAdapter;
using Morphodyne.Simulation;
using Morphodyne.Simulation.Logging;
using Xunit;

namespace Morphodyne.Core.Tests
{
    public sealed class FoundationBoundaryTests
    {
        [Fact]
        public void FixedStepSimulationForwardsMonotonicBackendNeutralSteps()
        {
            var adapter = new RecordingPhysicsAdapter();
            var logs = new RecordingLogSink();
            var simulation = new FixedStepSimulation(adapter, 0.02d, logs);

            simulation.Step();
            simulation.Step();

            Assert.Equal(2, simulation.CompletedSteps);
            Assert.Equal(2, adapter.Steps.Count);
            Assert.Equal(0, adapter.Steps[0].Index);
            Assert.Equal(1, adapter.Steps[1].Index);
            Assert.Equal(0.02d, adapter.Steps[1].DeltaSeconds);
            Assert.Equal(2, logs.Entries.Count);
            Assert.Equal("fixed_step_completed", logs.Entries[1].EventName);
        }

        [Fact]
        public void FailedPhysicsStepDoesNotAdvanceAuthoritativeStepCount()
        {
            var adapter = new ThrowingPhysicsAdapter();
            var logs = new RecordingLogSink();
            var simulation = new FixedStepSimulation(adapter, 0.02d, logs);

            Assert.Throws<InvalidOperationException>(() => simulation.Step());
            Assert.Equal(0, simulation.CompletedSteps);
            Assert.Empty(logs.Entries);
        }

        [Fact]
        public void PhysicsStepRejectsInvalidTimeInputs()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => new PhysicsStep(-1, 0.02d));
            Assert.Throws<ArgumentOutOfRangeException>(() => new PhysicsStep(0, 0d));
            Assert.Throws<ArgumentOutOfRangeException>(() => new PhysicsStep(0, double.PositiveInfinity));
        }

        [Fact]
        public void LogEntriesRequireStableStructuredFields()
        {
            Assert.Throws<ArgumentException>(() =>
                new SimulationLogEntry(SimulationLogLevel.Information, "", "event_name", 0, "message"));
            Assert.Throws<ArgumentException>(() =>
                new SimulationLogEntry(SimulationLogLevel.Information, "Core", "", 0, "message"));
            Assert.Throws<ArgumentOutOfRangeException>(() =>
                new SimulationLogEntry(SimulationLogLevel.Information, "Core", "event_name", -1, "message"));
        }

        private sealed class RecordingPhysicsAdapter : IPhysicsAdapter
        {
            public List<PhysicsStep> Steps { get; } = new List<PhysicsStep>();

            public void Step(PhysicsStep step)
            {
                Steps.Add(step);
            }
        }

        private sealed class ThrowingPhysicsAdapter : IPhysicsAdapter
        {
            public void Step(PhysicsStep step)
            {
                throw new InvalidOperationException("Backend failure for test.");
            }
        }

        private sealed class RecordingLogSink : ISimulationLogSink
        {
            public List<SimulationLogEntry> Entries { get; } = new List<SimulationLogEntry>();

            public void Write(SimulationLogEntry entry)
            {
                Entries.Add(entry);
            }
        }
    }
}
