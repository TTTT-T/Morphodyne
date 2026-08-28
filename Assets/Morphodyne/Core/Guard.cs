using System;

namespace Morphodyne.Core
{
    internal static class Guard
    {
        public static Guid NonEmpty(Guid value, string parameterName)
        {
            if (value == Guid.Empty)
            {
                throw new ArgumentException("The identifier cannot be empty.", parameterName);
            }

            return value;
        }

        public static string NonBlank(string value, string parameterName)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new ArgumentException("The value cannot be blank.", parameterName);
            }

            return value;
        }

        public static double Finite(double value, string parameterName)
        {
            if (double.IsNaN(value) || double.IsInfinity(value))
            {
                throw new ArgumentOutOfRangeException(parameterName, "The value must be finite.");
            }

            return value;
        }

        public static double Positive(double value, string parameterName)
        {
            Finite(value, parameterName);
            if (value <= 0d)
            {
                throw new ArgumentOutOfRangeException(parameterName, "The value must be greater than zero.");
            }

            return value;
        }

        public static double NonNegative(double value, string parameterName)
        {
            Finite(value, parameterName);
            if (value < 0d)
            {
                throw new ArgumentOutOfRangeException(parameterName, "The value cannot be negative.");
            }

            return value;
        }
    }
}
