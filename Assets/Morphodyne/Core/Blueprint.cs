using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace Morphodyne.Core
{
    public sealed class Blueprint
    {
        public Blueprint(
            Guid id,
            string name,
            IEnumerable<Part> parts,
            IEnumerable<Connection> connections)
        {
            Id = Guard.NonEmpty(id, nameof(id));
            Name = Guard.NonBlank(name, nameof(name));
            Parts = Structure.CopyParts(parts, nameof(parts));
            Connections = Structure.CopyConnections(connections, Parts, nameof(connections));
        }

        public Guid Id { get; }

        public string Name { get; }

        public ReadOnlyCollection<Part> Parts { get; }

        public ReadOnlyCollection<Connection> Connections { get; }
    }
}
