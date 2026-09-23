# Physics Adapter

Rapier-specific mapping belongs here.

`PhysicsAdapter.createBody` maps a validated Blueprint instance to a `PhysicsBody`: one Rapier rigid body and collider per Part, and one impulse joint per Connection. Box, sphere, capsule, and convex hull geometry are supported. Collider density, friction, and restitution come from Material; a Part may override its mass. External impulses are available for passive physics experiments.

`PhysicsBody` exposes stable Part and Connection handles and read-only Part poses without leaking Rapier runtime objects into Core. The adapter owns those objects and executes the fixed steps requested by Simulation.
