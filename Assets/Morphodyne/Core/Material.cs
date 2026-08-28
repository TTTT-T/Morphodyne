using System;

namespace Morphodyne.Core
{
    public sealed class Material
    {
        public Material(
            Guid id,
            string name,
            double density,
            double hardness,
            double elasticity,
            double toughness,
            double friction,
            double tensileStrength,
            double compressionStrength,
            double shearStrength,
            double heatLimit)
        {
            Id = Guard.NonEmpty(id, nameof(id));
            Name = Guard.NonBlank(name, nameof(name));
            Density = Guard.Positive(density, nameof(density));
            Hardness = Guard.NonNegative(hardness, nameof(hardness));
            Elasticity = Guard.NonNegative(elasticity, nameof(elasticity));
            Toughness = Guard.NonNegative(toughness, nameof(toughness));
            Friction = Guard.NonNegative(friction, nameof(friction));
            TensileStrength = Guard.NonNegative(tensileStrength, nameof(tensileStrength));
            CompressionStrength = Guard.NonNegative(compressionStrength, nameof(compressionStrength));
            ShearStrength = Guard.NonNegative(shearStrength, nameof(shearStrength));
            HeatLimit = Guard.Finite(heatLimit, nameof(heatLimit));
        }

        public Guid Id { get; }

        public string Name { get; }

        public double Density { get; }

        public double Hardness { get; }

        public double Elasticity { get; }

        public double Toughness { get; }

        public double Friction { get; }

        public double TensileStrength { get; }

        public double CompressionStrength { get; }

        public double ShearStrength { get; }

        public double HeatLimit { get; }
    }
}
