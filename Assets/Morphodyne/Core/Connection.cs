using System;

namespace Morphodyne.Core
{
    public enum ConnectionKind
    {
        Rigid,
        Joint,
        Flexible,
        Tension,
        Flow,
        Signal
    }

    public sealed class Connection
    {
        public Connection(Guid id, Guid firstPartId, Guid secondPartId, ConnectionKind kind)
        {
            Id = Guard.NonEmpty(id, nameof(id));
            FirstPartId = Guard.NonEmpty(firstPartId, nameof(firstPartId));
            SecondPartId = Guard.NonEmpty(secondPartId, nameof(secondPartId));
            if (FirstPartId == SecondPartId)
            {
                throw new ArgumentException("A connection must join two distinct parts.", nameof(secondPartId));
            }

            Kind = kind;
        }

        public Guid Id { get; }

        public Guid FirstPartId { get; }

        public Guid SecondPartId { get; }

        public ConnectionKind Kind { get; }
    }
}
