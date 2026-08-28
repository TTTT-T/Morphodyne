using System;

namespace Morphodyne.PhysicsAdapter
{
    public readonly struct PhysicsStep
    {
        public PhysicsStep(long index, double deltaSeconds)
        {
            if (index < 0)
            {
                throw new ArgumentOutOfRangeException(nameof(index), "Step index cannot be negative.");
            }

            if (double.IsNaN(deltaSeconds) || double.IsInfinity(deltaSeconds) || deltaSeconds <= 0d)
            {
                throw new ArgumentOutOfRangeException(nameof(deltaSeconds), "Step duration must be finite and greater than zero.");
            }

            Index = index;
            DeltaSeconds = deltaSeconds;
        }

        public long Index { get; }

        public double DeltaSeconds { get; }
    }
}
