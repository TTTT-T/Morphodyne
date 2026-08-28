using System;
using System.Collections.Generic;
using System.Linq;
using Morphodyne.Core;
using Xunit;
using CoreMaterial = Morphodyne.Core.Material;

namespace Morphodyne.Core.Tests
{
    public sealed class CoreModelTests
    {
        [Fact]
        public void EntityIdRoundTripsFromCallerProvidedValueWithoutAllowingEmptyIdentifiers()
        {
            var original = new EntityId(Guid.NewGuid());

            Assert.True(EntityId.TryParse(original.ToString(), out EntityId parsed));
            Assert.Equal(original, parsed);
            Assert.Throws<ArgumentException>(() => new EntityId(Guid.Empty));
            Assert.False(EntityId.TryParse(Guid.Empty.ToString(), out _));
        }

        [Fact]
        public void EntityIdExposesNoAmbientRandomFactory()
        {
            Assert.DoesNotContain(
                typeof(EntityId).GetMethods(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static),
                method => method.ReturnType == typeof(EntityId) && method.GetParameters().Length == 0);
        }

        [Fact]
        public void MaterialRejectsNonPhysicalScalarInputs()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => CreateMaterial(density: 0d));
            Assert.Throws<ArgumentOutOfRangeException>(() => CreateMaterial(friction: -0.01d));
            Assert.Throws<ArgumentOutOfRangeException>(() => CreateMaterial(heatLimit: double.NaN));
        }

        [Fact]
        public void PartRequiresMaterialAndPositiveMass()
        {
            Assert.Throws<ArgumentNullException>(() => new Part(Guid.NewGuid(), null!, 1d, 293d));
            Assert.Throws<ArgumentOutOfRangeException>(() => new Part(Guid.NewGuid(), CreateMaterial(), 0d, 293d));
        }

        [Fact]
        public void ConnectionRequiresDistinctPartEndpoints()
        {
            Guid partId = Guid.NewGuid();

            Assert.Throws<ArgumentException>(() =>
                new Connection(Guid.NewGuid(), partId, partId, ConnectionKind.Rigid));
        }

        [Fact]
        public void BlueprintCopiesCollectionsAndRequiresInternalEndpoints()
        {
            Part first = CreatePart();
            Part second = CreatePart();
            var sourceParts = new List<Part> { first, second };
            var sourceConnections = new List<Connection>
            {
                new Connection(Guid.NewGuid(), first.Id, second.Id, ConnectionKind.Flexible)
            };
            var blueprint = new Blueprint(Guid.NewGuid(), "test structure", sourceParts, sourceConnections);

            sourceParts.Clear();
            sourceConnections.Clear();

            Assert.Equal(2, blueprint.Parts.Count);
            Assert.Single(blueprint.Connections);
            Assert.Throws<ArgumentException>(() => new Blueprint(
                Guid.NewGuid(),
                "invalid structure",
                new[] { first },
                new[] { new Connection(Guid.NewGuid(), first.Id, Guid.NewGuid(), ConnectionKind.Signal) }));
        }

        [Fact]
        public void EntityRejectsDuplicatePartIdentifiers()
        {
            CoreMaterial material = CreateMaterial();
            Guid duplicateId = Guid.NewGuid();
            Part first = new Part(duplicateId, material, 1d, 293d);
            Part second = new Part(duplicateId, material, 2d, 293d);

            Assert.Throws<ArgumentException>(() =>
                new Entity(new EntityId(Guid.NewGuid()), new[] { first, second }, Array.Empty<Connection>()));
        }

        [Fact]
        public void EventContainsOnlyTypedAuthoritativeDataAndOptionalCausalReference()
        {
            Guid cause = Guid.NewGuid();
            var simulationEvent = new Event(
                Guid.NewGuid(),
                12,
                EventKind.Contact,
                new EntityId(Guid.NewGuid()),
                cause);

            Assert.Equal(12, simulationEvent.SimulationTick);
            Assert.Equal(cause, simulationEvent.CausedByEventId);
            Assert.DoesNotContain(
                typeof(Event).GetProperties(),
                property => property.PropertyType == typeof(string));
            Assert.Throws<ArgumentOutOfRangeException>(() =>
                new Event(Guid.NewGuid(), -1, EventKind.Contact));
        }

        [Fact]
        public void CorePublicSurfaceContainsNoPredefinedAbilityProperties()
        {
            string[] forbidden = { "canWalk", "canFly", "canBite", "moveSpeed", "attackPower", "biteDamage" };
            string[] memberNames = typeof(Entity).Assembly
                .GetExportedTypes()
                .SelectMany(type => type.GetMembers())
                .Select(member => member.Name)
                .ToArray();

            foreach (string forbiddenName in forbidden)
            {
                Assert.DoesNotContain(memberNames, name =>
                    string.Equals(name, forbiddenName, StringComparison.OrdinalIgnoreCase));
            }
        }

        [Fact]
        public void CoreAssemblyHasNoUnityOrProjectAssemblyDependencies()
        {
            string[] references = typeof(Entity).Assembly
                .GetReferencedAssemblies()
                .Select(reference => reference.Name ?? string.Empty)
                .ToArray();

            Assert.DoesNotContain(references, name => name.StartsWith("Unity", StringComparison.Ordinal));
            Assert.DoesNotContain(references, name => name.StartsWith("Morphodyne.", StringComparison.Ordinal));
        }

        private static CoreMaterial CreateMaterial(
            double density = 1d,
            double friction = 0.5d,
            double heatLimit = 500d)
        {
            return new CoreMaterial(
                Guid.NewGuid(),
                "test material",
                density,
                hardness: 1d,
                elasticity: 1d,
                toughness: 1d,
                friction,
                tensileStrength: 1d,
                compressionStrength: 1d,
                shearStrength: 1d,
                heatLimit);
        }

        private static Part CreatePart()
        {
            return new Part(Guid.NewGuid(), CreateMaterial(), 1d, 293d);
        }
    }
}
