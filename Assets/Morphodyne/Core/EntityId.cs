using System;

namespace Morphodyne.Core
{
    public readonly struct EntityId : IEquatable<EntityId>
    {
        public EntityId(Guid value)
        {
            Value = Guard.NonEmpty(value, nameof(value));
        }

        public Guid Value { get; }

        public static EntityId Parse(string value)
        {
            return new EntityId(Guid.Parse(value));
        }

        public static bool TryParse(string? value, out EntityId entityId)
        {
            if (Guid.TryParse(value, out Guid parsed) && parsed != Guid.Empty)
            {
                entityId = new EntityId(parsed);
                return true;
            }

            entityId = default;
            return false;
        }

        public bool Equals(EntityId other)
        {
            return Value.Equals(other.Value);
        }

        public override bool Equals(object? obj)
        {
            return obj is EntityId other && Equals(other);
        }

        public override int GetHashCode()
        {
            return Value.GetHashCode();
        }

        public override string ToString()
        {
            return Value.ToString("D");
        }

        public static bool operator ==(EntityId left, EntityId right)
        {
            return left.Equals(right);
        }

        public static bool operator !=(EntityId left, EntityId right)
        {
            return !left.Equals(right);
        }
    }
}
