using System;

namespace Morphodyne.Core
{
    public sealed class Part
    {
        public Part(Guid id, Material material, double mass, double temperature)
        {
            Id = Guard.NonEmpty(id, nameof(id));
            Material = material ?? throw new ArgumentNullException(nameof(material));
            Mass = Guard.Positive(mass, nameof(mass));
            Temperature = Guard.Finite(temperature, nameof(temperature));
        }

        public Guid Id { get; }

        public Material Material { get; }

        public double Mass { get; }

        public double Temperature { get; }
    }
}
