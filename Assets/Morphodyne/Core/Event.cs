using System;

namespace Morphodyne.Core
{
    public enum EventKind
    {
        Contact,
        Structural,
        Transfer,
        Perception,
        SignificantStateChange
    }

    public sealed class Event
    {
        public Event(
            Guid id,
            long simulationTick,
            EventKind kind,
            string fact,
            EntityId? subjectEntityId = null,
            Guid? causedByEventId = null)
        {
            Id = Guard.NonEmpty(id, nameof(id));
            if (simulationTick < 0)
            {
                throw new ArgumentOutOfRangeException(nameof(simulationTick), "Simulation tick cannot be negative.");
            }

            if (causedByEventId == Guid.Empty)
            {
                throw new ArgumentException("A causal event identifier cannot be empty.", nameof(causedByEventId));
            }

            SimulationTick = simulationTick;
            Kind = kind;
            Fact = Guard.NonBlank(fact, nameof(fact));
            SubjectEntityId = subjectEntityId;
            CausedByEventId = causedByEventId;
        }

        public Guid Id { get; }

        public long SimulationTick { get; }

        public EventKind Kind { get; }

        public string Fact { get; }

        public EntityId? SubjectEntityId { get; }

        public Guid? CausedByEventId { get; }
    }
}
