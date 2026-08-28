using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace Morphodyne.Core
{
    public sealed class Entity
    {
        public Entity(EntityId id, IEnumerable<Part> parts, IEnumerable<Connection> connections)
        {
            Id = id;
            Parts = Structure.CopyParts(parts, nameof(parts));
            Connections = Structure.CopyConnections(connections, Parts, nameof(connections));
        }

        public EntityId Id { get; }

        public ReadOnlyCollection<Part> Parts { get; }

        public ReadOnlyCollection<Connection> Connections { get; }
    }
}
