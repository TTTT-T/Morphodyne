using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace Morphodyne.Core
{
    internal static class Structure
    {
        public static ReadOnlyCollection<Part> CopyParts(IEnumerable<Part> parts, string parameterName)
        {
            if (parts == null)
            {
                throw new ArgumentNullException(parameterName);
            }

            var copy = new List<Part>();
            var ids = new HashSet<Guid>();
            foreach (Part part in parts)
            {
                if (part == null)
                {
                    throw new ArgumentException("A structure cannot contain a null part.", parameterName);
                }

                if (!ids.Add(part.Id))
                {
                    throw new ArgumentException("Part identifiers must be unique within a structure.", parameterName);
                }

                copy.Add(part);
            }

            return copy.AsReadOnly();
        }

        public static ReadOnlyCollection<Connection> CopyConnections(
            IEnumerable<Connection> connections,
            IReadOnlyCollection<Part> parts,
            string parameterName)
        {
            if (connections == null)
            {
                throw new ArgumentNullException(parameterName);
            }

            var partIds = new HashSet<Guid>();
            foreach (Part part in parts)
            {
                partIds.Add(part.Id);
            }

            var copy = new List<Connection>();
            var connectionIds = new HashSet<Guid>();
            foreach (Connection connection in connections)
            {
                if (connection == null)
                {
                    throw new ArgumentException("A structure cannot contain a null connection.", parameterName);
                }

                if (!connectionIds.Add(connection.Id))
                {
                    throw new ArgumentException("Connection identifiers must be unique within a structure.", parameterName);
                }

                if (!partIds.Contains(connection.FirstPartId) || !partIds.Contains(connection.SecondPartId))
                {
                    throw new ArgumentException("Every connection endpoint must reference a part in the same structure.", parameterName);
                }

                copy.Add(connection);
            }

            return copy.AsReadOnly();
        }
    }
}
